import {
  diasDeVentana,
  FORMATO_FECHA,
  FORMATO_HORA,
  instanteEnZona,
} from "@/lib/disponibilidad"
import {
  TIPOS_CEREMONIA,
  TIPOS_CEREMONIA_ORDEN,
  type Sprint,
  type TipoCeremonia,
} from "@/lib/dominio"
import { type Db } from "@/lib/sprints"

// Ceremonias de sprint, compartido por las server actions y el MCP.
//
// "Definir" las ceremonias de un sprint es reemplazar el juego completo: se
// hace soft delete de las que tenía y se insertan las nuevas. La daily se
// expande a una ocurrencia por día hábil elegido dentro de las fechas del
// sprint; el resto es una ocurrencia cada una. Las horas son hora de pared en
// America/Montevideo (ver disponibilidad.ts), lo guardado es el instante.

export type CeremoniaPuntual = { fecha: string; hora: string; duracion_min?: number }
export type DailyPlan = {
  hora: string
  duracion_min?: number
  // 1 = lunes … 5 = viernes (ISO weekday). Default lunes a viernes.
  dias?: number[]
}

export type PlanCeremonias = {
  planning?: CeremoniaPuntual | null
  daily?: DailyPlan | null
  review?: CeremoniaPuntual | null
  retro?: CeremoniaPuntual | null
}

type Fila = { tipo: TipoCeremonia; inicio: string; duracion_min: number }

// "YYYY-MM" → primer y último día del mes. (Acá y no en el componente del
// calendario porque ese archivo es "use client" y la página server la usa.)
export function rangoMes(mes: string): { desde: string; hasta: string } {
  const [a, m] = mes.split("-").map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` }
}

// ISO weekday (1 = lunes … 7 = domingo) de una fecha "YYYY-MM-DD".
export function diaSemana(fecha: string): number {
  const d = new Date(`${fecha}T12:00:00Z`).getUTCDay()
  return d === 0 ? 7 : d
}

function instante(fecha: string, hora: string, que: string): string {
  if (!FORMATO_FECHA.test(fecha)) throw new Error(`${que}: fecha inválida "${fecha}"`)
  if (!FORMATO_HORA.test(hora)) throw new Error(`${que}: hora inválida "${hora}"`)
  const ms = instanteEnZona(fecha, hora)
  if (!Number.isFinite(ms)) throw new Error(`${que}: "${fecha} ${hora}" no es una fecha real`)
  return new Date(ms).toISOString()
}

function duracion(valor: number | undefined, tipo: TipoCeremonia): number {
  const d = valor ?? TIPOS_CEREMONIA[tipo].duracion
  if (!Number.isInteger(d) || d < 5 || d > 480) {
    throw new Error(`${TIPOS_CEREMONIA[tipo].label}: la duración tiene que estar entre 5 y 480 minutos`)
  }
  return d
}

// Expande el plan a filas concretas. Puro: se puede testear sin base.
export function expandirPlan(
  plan: PlanCeremonias,
  sprint: Pick<Sprint, "fecha_inicio" | "fecha_fin">
): Fila[] {
  const filas: Fila[] = []
  for (const tipo of TIPOS_CEREMONIA_ORDEN) {
    if (tipo === "daily") continue
    const p = plan[tipo]
    if (!p) continue
    filas.push({
      tipo,
      inicio: instante(p.fecha, p.hora, TIPOS_CEREMONIA[tipo].label),
      duracion_min: duracion(p.duracion_min, tipo),
    })
  }
  if (plan.daily) {
    if (!sprint.fecha_inicio || !sprint.fecha_fin) {
      throw new Error("Para generar las dailies el sprint necesita fecha de inicio y de fin")
    }
    const dias = plan.daily.dias?.length ? plan.daily.dias : [1, 2, 3, 4, 5]
    const dur = duracion(plan.daily.duracion_min, "daily")
    for (const fecha of diasDeVentana(sprint.fecha_inicio, sprint.fecha_fin)) {
      if (!dias.includes(diaSemana(fecha))) continue
      filas.push({
        tipo: "daily",
        inicio: instante(fecha, plan.daily.hora, "Daily"),
        duracion_min: dur,
      })
    }
  }
  return filas.sort((a, b) => a.inicio.localeCompare(b.inicio))
}

export async function definirCeremonias(
  db: Db,
  sprintId: string,
  plan: PlanCeremonias,
  creadoPor: string | null
): Promise<{ creadas: number; reemplazadas: number }> {
  const { data: sprint } = await db
    .from("sprints")
    .select("id, estado, fecha_inicio, fecha_fin")
    .eq("id", sprintId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!sprint) throw new Error("El sprint no existe")
  if (sprint.estado === "cerrado") throw new Error("El sprint está cerrado: sus ceremonias son historial")

  const filas = expandirPlan(plan, sprint as Pick<Sprint, "fecha_inicio" | "fecha_fin">)

  const { data: anteriores, error: errorBorrar } = await db
    .from("ceremonias")
    .update({ deleted_at: new Date().toISOString() })
    .eq("sprint_id", sprintId)
    .is("deleted_at", null)
    .select("id")
  if (errorBorrar) throw new Error(errorBorrar.message)

  if (filas.length > 0) {
    const { error } = await db
      .from("ceremonias")
      .insert(filas.map((f) => ({ ...f, sprint_id: sprintId, created_by: creadoPor })))
    if (error) throw new Error(error.message)
  }
  return { creadas: filas.length, reemplazadas: anteriores?.length ?? 0 }
}

// Plan por defecto para un sprint con fechas: planning el primer día, daily
// todos los hábiles, review y retro el último. Es lo que precarga el
// formulario y lo que el MCP usa si se le pide "las ceremonias de siempre".
export function planPorDefecto(
  sprint: Pick<Sprint, "fecha_inicio" | "fecha_fin">
): PlanCeremonias {
  if (!sprint.fecha_inicio || !sprint.fecha_fin) return {}
  return {
    planning: { fecha: sprint.fecha_inicio, hora: TIPOS_CEREMONIA.planning.hora },
    daily: { hora: TIPOS_CEREMONIA.daily.hora },
    review: { fecha: sprint.fecha_fin, hora: TIPOS_CEREMONIA.review.hora },
    retro: { fecha: sprint.fecha_fin, hora: TIPOS_CEREMONIA.retro.hora },
  }
}

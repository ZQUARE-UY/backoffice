"use server"

import { revalidatePath } from "next/cache"

import {
  definirCeremonias as definirCeremoniasDb,
  type CeremoniaPuntual,
  type DailyPlan,
  type PlanCeremonias,
} from "@/lib/ceremonias"
import {
  RE_CODIGO_PROYECTO,
  RE_EPICA,
  TIPOS_CEREMONIA,
  type Ceremonia,
} from "@/lib/dominio"
import { idSocioActual } from "@/lib/socio-actual"
import {
  completarSprint as completarSprintDb,
  iniciarSprint as iniciarSprintDb,
  moverTarjetaASprint,
  ordenAlTope as ordenAlTopeDb,
  ubicacionCoherente,
  type DestinoPendientes,
} from "@/lib/sprints"
import { createClient } from "@/lib/supabase/server"

function textoOpcional(valor: FormDataEntryValue | null): string | null {
  const t = (valor as string | null)?.trim()
  return t ? t : null
}

// Los códigos se guardan en mayúsculas para que "us-14" y "US-14" no terminen
// siendo dos códigos distintos que parecen el mismo. Se valida acá además de
// en la base: el check constraint devuelve un error de Postgres ilegible, y
// este mensaje dice qué se esperaba.
function codigoOpcional(
  valor: FormDataEntryValue | null,
  patron: RegExp,
  ejemplo: string
): string | null {
  const t = textoOpcional(valor)?.toUpperCase() ?? null
  if (t && !patron.test(t)) {
    throw new Error(`"${t}" no tiene el formato esperado (ej. ${ejemplo})`)
  }
  return t
}

function estimacionOpcional(valor: FormDataEntryValue | null): number | null {
  const t = textoOpcional(valor)
  return t ? Number(t) : null
}

function datosDesde(formData: FormData) {
  const titulo = (formData.get("titulo") as string | null)?.trim()
  if (!titulo) throw new Error("El título es obligatorio")
  const etiquetas = textoOpcional(formData.get("etiquetas"))
  return {
    titulo,
    descripcion: textoOpcional(formData.get("descripcion")),
    contexto: textoOpcional(formData.get("contexto")),
    resultado: textoOpcional(formData.get("resultado")),
    recursos: textoOpcional(formData.get("recursos")),
    plan: textoOpcional(formData.get("plan")),
    estado: (formData.get("estado") as string | null) ?? "backlog",
    prioridad: (formData.get("prioridad") as string | null) ?? "media",
    codigo_proyecto: codigoOpcional(
      formData.get("codigo_proyecto"),
      RE_CODIGO_PROYECTO,
      "US-014"
    ),
    estimacion: estimacionOpcional(formData.get("estimacion")),
    moscow: textoOpcional(formData.get("moscow")),
    epica: codigoOpcional(formData.get("epica"), RE_EPICA, "EP-3"),
    asignado_a: textoOpcional(formData.get("asignado_a")),
    cliente_id: textoOpcional(formData.get("cliente_id")),
    proyecto_id: textoOpcional(formData.get("proyecto_id")),
    // El select de sprint solo se muestra cuando hay sprints: si el campo no
    // vino, no se toca (undefined se descarta al serializar el update).
    sprint_id: formData.has("sprint_id")
      ? textoOpcional(formData.get("sprint_id"))
      : undefined,
    fecha_limite: textoOpcional(formData.get("fecha_limite")),
    etiquetas: etiquetas
      ? etiquetas
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean)
      : [],
  }
}

// Las tarjetas nuevas entran arriba de su columna: `orden` menor que el mínimo
// actual. Ver la migración para por qué `orden` es numeric.
async function ordenAlTope(estado: string): Promise<number> {
  return ordenAlTopeDb(await createClient(), estado)
}

// Historial de co-edición: cada creación/edición deja un snapshot del
// contenido con su autor (los movimientos de columna/orden no versionan).
// Explícito (no trigger) para poder atribuirlo, igual que en ideas.
async function guardarVersion(
  tareaId: string,
  snapshot: Record<string, unknown>
) {
  const supabase = await createClient()
  const socioId = await idSocioActual()
  const { data: socio } = socioId
    ? await supabase.from("socios").select("nombre").eq("id", socioId).maybeSingle()
    : { data: null }

  await supabase.from("tareas_versiones").insert({
    tarea_id: tareaId,
    snapshot,
    autor: socio?.nombre ?? "Socio",
    autor_socio_id: socioId,
  })
}

export async function crearTarea(formData: FormData) {
  const datos = datosDesde(formData)
  const supabase = await createClient()
  // Coherencia columna ↔ sprint (ver lib/sprints.ts): si eligió un sprint, la
  // columna se acomoda a él; si no, entrar al tablero la suma al sprint activo.
  const ubicacion = await ubicacionCoherente(
    supabase,
    { estado: datos.estado, sprint_id: datos.sprint_id ?? null },
    datos.sprint_id ? "sprint" : "estado"
  )
  const { data, error } = await supabase
    .from("tareas")
    .insert({
      ...datos,
      ...ubicacion,
      orden: await ordenAlTope(ubicacion.estado),
      created_by: await idSocioActual(),
    })
    .select("id, numero")
    .single()
  if (error) throw new Error(error.message)
  await guardarVersion(data.id, datos)
  revalidatePath("/tareas")
  // La captura rápida (tecla N) crea tarjetas desde cualquier pantalla:
  // devuelve el número para que el toast pueda linkear a la ficha.
  return { id: data.id as string, numero: data.numero as number }
}

// Proyectos activos para el select de la captura rápida (tecla N). Se cargan
// recién al abrirla, así el resto de las pantallas no paga esta query.
export async function proyectosParaCaptura(): Promise<
  { id: string; nombre: string; cliente: string | null; cliente_id: string | null }[]
> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("proyectos")
    .select("id, nombre, cliente_id, clientes(nombre)")
    .is("deleted_at", null)
    .order("nombre")
  if (error) throw new Error(error.message)
  type Fila = {
    id: string
    nombre: string
    cliente_id: string | null
    clientes: { nombre: string } | null
  }
  return ((data ?? []) as unknown as Fila[]).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    cliente: p.clientes?.nombre ?? null,
    cliente_id: p.cliente_id,
  }))
}

export async function actualizarTarea(id: string, formData: FormData) {
  const datos = datosDesde(formData)
  const supabase = await createClient()
  const { data: actual } = await supabase
    .from("tareas")
    .select("estado, sprint_id")
    .eq("id", id)
    .maybeSingle()
  if (!actual) throw new Error("La tarjeta no existe")
  // Si en el formulario cambió el sprint, manda el sprint (la columna se
  // acomoda); si cambió la columna, manda la columna (el sprint se acomoda).
  // Si no cambió ninguno, la ubicación queda como está (una tarjeta archivada
  // en un sprint cerrado se puede editar sin que salga de él).
  const sprintDeseado =
    datos.sprint_id === undefined ? actual.sprint_id : datos.sprint_id
  const cambioSprint = actual.sprint_id !== sprintDeseado
  const cambioEstado = actual.estado !== datos.estado
  const ubicacion =
    cambioSprint || cambioEstado
      ? await ubicacionCoherente(
          supabase,
          { estado: datos.estado, sprint_id: sprintDeseado },
          cambioSprint ? "sprint" : "estado"
        )
      : { estado: actual.estado, sprint_id: actual.sprint_id }
  // Si la edición cambia la columna, la tarjeta entra al tope de la nueva (igual
  // que el MCP); si no, conserva su posición: sin esto heredaría un `orden` de
  // otra columna y aterrizaría en cualquier lado.
  const cambios =
    actual.estado !== ubicacion.estado
      ? { ...datos, ...ubicacion, orden: await ordenAlTope(ubicacion.estado) }
      : { ...datos, ...ubicacion }
  const { error } = await supabase.from("tareas").update(cambios).eq("id", id)
  if (error) throw new Error(error.message)
  await guardarVersion(id, datos)
  revalidatePath("/tareas")
}

// "Pasar al tablero" desde la vista Backlog: la tarjeta se compromete y entra
// arriba de Por hacer (y al sprint activo, si lo hay). Server-side porque el
// backlog no conoce los `orden` de esa columna.
export async function pasarAlTablero(id: string) {
  const supabase = await createClient()
  const ubicacion = await ubicacionCoherente(
    supabase,
    { estado: "por_hacer", sprint_id: null },
    "estado"
  )
  const { error } = await supabase
    .from("tareas")
    .update({ ...ubicacion, orden: await ordenAlTope("por_hacer") })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/tareas")
}

// Mover una tarjeta: nueva columna y posición dentro de ella. `orden` lo calcula
// el tablero como punto medio entre las dos vecinas, así solo se toca esta fila.
export async function moverTarea(id: string, estado: string, orden: number) {
  const supabase = await createClient()
  const { data: actual } = await supabase
    .from("tareas")
    .select("sprint_id")
    .eq("id", id)
    .maybeSingle()
  // El sprint se acomoda a la columna: entrar al tablero suma al activo, volver
  // a backlog desde el activo saca del sprint; reordenar dentro de un sprint
  // planificado (backlog → backlog) no toca nada.
  const ubicacion = await ubicacionCoherente(
    supabase,
    { estado, sprint_id: actual?.sprint_id ?? null },
    "estado"
  )
  const { error } = await supabase
    .from("tareas")
    .update({ ...ubicacion, orden })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/tareas")
}

// ── Sprints ───────────────────────────────────────────────────────────────

function datosSprintDesde(formData: FormData) {
  const nombre = (formData.get("nombre") as string | null)?.trim()
  if (!nombre) throw new Error("El nombre es obligatorio")
  return {
    nombre,
    objetivo: textoOpcional(formData.get("objetivo")),
    fecha_inicio: textoOpcional(formData.get("fecha_inicio")),
    fecha_fin: textoOpcional(formData.get("fecha_fin")),
    proyecto_id: textoOpcional(formData.get("proyecto_id")),
  }
}

export async function crearSprint(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.from("sprints").insert({
    ...datosSprintDesde(formData),
    created_by: await idSocioActual(),
  })
  if (error) throw new Error(error.message)
  revalidatePath("/tareas")
}

export async function actualizarSprint(id: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("sprints")
    .update(datosSprintDesde(formData))
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/tareas")
}

// Solo se borran sprints planificados (los cerrados son historial y el activo
// se completa). Sus tarjetas vuelven al backlog libre.
export async function eliminarSprint(id: string) {
  const supabase = await createClient()
  const { data: sprint } = await supabase
    .from("sprints")
    .select("estado")
    .eq("id", id)
    .maybeSingle()
  if (sprint?.estado !== "planificado") {
    throw new Error("Solo se puede eliminar un sprint planificado")
  }
  const { error: errorTareas } = await supabase
    .from("tareas")
    .update({ sprint_id: null })
    .eq("sprint_id", id)
  if (errorTareas) throw new Error(errorTareas.message)
  const { error } = await supabase
    .from("sprints")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/tareas")
}

export async function iniciarSprint(id: string, formData: FormData) {
  await iniciarSprintDb(await createClient(), id, {
    fecha_inicio: textoOpcional(formData.get("fecha_inicio")),
    fecha_fin: textoOpcional(formData.get("fecha_fin")),
  })
  revalidatePath("/tareas")
}

// Completar: lo hecho queda archivado en el sprint (sale del tablero) y lo
// pendiente va al backlog o al sprint planificado que se elija.
export async function completarSprint(id: string, formData: FormData) {
  const destinoId = textoOpcional(formData.get("destino"))
  const destino: DestinoPendientes =
    destinoId && destinoId !== "backlog"
      ? { tipo: "sprint", sprint_id: destinoId }
      : { tipo: "backlog" }
  await completarSprintDb(await createClient(), id, destino)
  revalidatePath("/tareas")
}

// Agregar una tarjeta a un sprint (o sacarla, con null) desde el backlog o el
// tablero. La columna se acomoda al sprint (ver lib/sprints.ts).
export async function moverASprint(tareaId: string, sprintId: string | null) {
  await moverTarjetaASprint(await createClient(), tareaId, sprintId)
  revalidatePath("/tareas")
}

export async function eliminarTarea(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("tareas")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/tareas")
}

export async function comentarTarea(tareaId: string, formData: FormData) {
  const cuerpo = (formData.get("cuerpo") as string | null)?.trim()
  if (!cuerpo) throw new Error("El comentario está vacío")

  const supabase = await createClient()
  const socioId = await idSocioActual()
  const { data: socio } = socioId
    ? await supabase.from("socios").select("nombre").eq("id", socioId).maybeSingle()
    : { data: null }

  const { error } = await supabase.from("tareas_comentarios").insert({
    tarea_id: tareaId,
    cuerpo,
    autor: socio?.nombre ?? "Socio",
    autor_socio_id: socioId,
  })
  if (error) throw new Error(error.message)
  revalidatePath("/tareas")
}

// ── Ceremonias ──────────────────────────────────────────────────────────────

// Las del sprint, para precargar el formulario "Ceremonias" al abrirlo (el
// encabezado del sprint no las trae: se piden recién ahí).
export async function ceremoniasDeSprint(sprintId: string): Promise<Ceremonia[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ceremonias")
    .select("*")
    .eq("sprint_id", sprintId)
    .is("deleted_at", null)
    .order("inicio", { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Ceremonia[]
}

// Campos del formulario: `<tipo>_on` (checkbox), `<tipo>_fecha`, `<tipo>_hora`,
// `<tipo>_duracion`; la daily no lleva fecha y suma `daily_dias` (1..5, varios).
function planDesde(formData: FormData): PlanCeremonias {
  const puntual = (tipo: "planning" | "review" | "retro"): CeremoniaPuntual | null => {
    if (!formData.get(`${tipo}_on`)) return null
    const fecha = textoOpcional(formData.get(`${tipo}_fecha`))
    const hora = textoOpcional(formData.get(`${tipo}_hora`))
    if (!fecha || !hora) throw new Error(`${TIPOS_CEREMONIA[tipo].label}: falta la fecha o la hora`)
    const dur = textoOpcional(formData.get(`${tipo}_duracion`))
    return { fecha, hora, duracion_min: dur ? Number(dur) : undefined }
  }
  let daily: DailyPlan | null = null
  if (formData.get("daily_on")) {
    const hora = textoOpcional(formData.get("daily_hora"))
    if (!hora) throw new Error("Daily: falta la hora")
    const dur = textoOpcional(formData.get("daily_duracion"))
    const dias = formData
      .getAll("daily_dias")
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
    if (dias.length === 0) throw new Error("Daily: elegí al menos un día de la semana")
    daily = { hora, duracion_min: dur ? Number(dur) : undefined, dias }
  }
  return {
    planning: puntual("planning"),
    daily,
    review: puntual("review"),
    retro: puntual("retro"),
  }
}

export async function definirCeremonias(sprintId: string, formData: FormData) {
  const resultado = await definirCeremoniasDb(
    await createClient(),
    sprintId,
    planDesde(formData),
    await idSocioActual()
  )
  revalidatePath("/tareas")
  return resultado
}

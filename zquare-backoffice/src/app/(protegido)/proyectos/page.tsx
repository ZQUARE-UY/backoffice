import Link from "next/link"

import { Encabezado } from "@/components/zq/encabezado"
import {
  briefProyectoCompleto,
  codigoSprint,
  proyectoComenzado,
  saludProyecto,
  type Proyecto,
  type Socio,
} from "@/lib/dominio"
import { fechaCorta, iniciales } from "@/lib/formato"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

import { AvisoSinArrancar } from "./aviso-sin-arrancar"
import { FiltrosProyectos } from "./filtros-proyectos"
import {
  BadgeEstadoProyecto,
  BarraAvance,
  finProyecto,
  plataProyecto,
  SaludTexto,
  TONO_TEXTO,
} from "./ui"

export const metadata = { title: "Proyectos" }

type Filtros = {
  estado?: string
  cliente?: string
  responsable?: string
  tipo?: string
  salud?: string
  arranque?: string
}

type ProyectoListado = Proyecto & { clientes: { nombre: string } | null }
type PresupuestoResumen = { proyecto_id: string; total: number; moneda: string; estado: string }

// Orden de la tabla: lo vivo arriba (en curso, mantenimiento, propuesta) y lo
// cerrado abajo; dentro de cada estado, por fecha de fin.
const PESO_ESTADO = Object.fromEntries(
  ["en_curso", "mantenimiento", "propuesta", "entregado", "cancelado"].map((e, i) => [e, i])
) as Record<string, number>

export default async function ProyectosPage({
  searchParams,
}: {
  searchParams: Promise<Filtros>
}) {
  const params = await searchParams
  const supabase = await createClient()

  let proyectosQuery = supabase
    .from("proyectos")
    .select("*, clientes(nombre)")
    .is("deleted_at", null)
    .order("fecha_fin_estimada", { nullsFirst: false })
    .order("nombre")
  if (params.estado) proyectosQuery = proyectosQuery.eq("estado", params.estado)
  if (params.cliente) proyectosQuery = proyectosQuery.eq("cliente_id", params.cliente)
  if (params.responsable) proyectosQuery = proyectosQuery.eq("responsable_id", params.responsable)
  if (params.tipo) proyectosQuery = proyectosQuery.eq("tipo", params.tipo)

  const [
    { data: proyectosData },
    { data: clientesData },
    { data: sociosData },
    { data: tareasData },
    { data: sprintData },
    { data: presupuestosData },
  ] = await Promise.all([
    proyectosQuery,
    supabase.from("clientes").select("id, nombre").is("deleted_at", null).order("nombre"),
    supabase.from("socios").select("id, nombre, email").is("deleted_at", null).order("nombre"),
    supabase
      .from("tareas")
      .select("proyecto_id, estado, sprint_id")
      .not("proyecto_id", "is", null)
      .is("deleted_at", null),
    supabase
      .from("sprints")
      .select("id, numero")
      .eq("estado", "activo")
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("presupuestos")
      .select("proyecto_id, total, moneda, estado")
      .not("proyecto_id", "is", null)
      .in("estado", ["aprobado", "enviado"])
      .is("deleted_at", null),
  ])

  const clientes = (clientesData ?? []) as { id: string; nombre: string }[]
  const socios = (sociosData ?? []) as Socio[]
  const nombreSocio = new Map(socios.map((s) => [s.id, s.nombre.split(" ")[0]]))
  const sprint = sprintData as { id: string; numero: number } | null

  // Por proyecto: tareas abiertas y avance en el sprint activo.
  type Conteo = { abiertas: number; enSprint: number; hechasSprint: number }
  const conteos = new Map<string, Conteo>()
  for (const t of (tareasData ?? []) as { proyecto_id: string; estado: string; sprint_id: string | null }[]) {
    const c = conteos.get(t.proyecto_id) ?? { abiertas: 0, enSprint: 0, hechasSprint: 0 }
    if (t.estado !== "hecho") c.abiertas++
    if (sprint && t.sprint_id === sprint.id) {
      c.enSprint++
      if (t.estado === "hecho") c.hechasSprint++
    }
    conteos.set(t.proyecto_id, c)
  }

  // El presupuesto más firme de cada proyecto (aprobado antes que enviado).
  const presupuesto = new Map<string, PresupuestoResumen>()
  for (const p of (presupuestosData ?? []) as PresupuestoResumen[]) {
    const actual = presupuesto.get(p.proyecto_id)
    if (!actual || (actual.estado !== "aprobado" && p.estado === "aprobado")) {
      presupuesto.set(p.proyecto_id, { ...p, total: Number(p.total) })
    }
  }

  // Un solo "ahora" por request, para que la salud de todas las filas se
  // calcule contra la misma fecha.
  const hoy = new Date()

  const proyectos = ((proyectosData ?? []) as unknown as ProyectoListado[])
    .filter((p) => {
      if (params.salud && saludProyecto(p, hoy) !== params.salud) return false
      if (params.arranque === "sin_comenzar" && proyectoComenzado(p)) return false
      if (params.arranque === "comenzado" && !proyectoComenzado(p)) return false
      return true
    })
    .sort((a, b) => (PESO_ESTADO[a.estado] ?? 9) - (PESO_ESTADO[b.estado] ?? 9))

  const sinArrancar = proyectos.filter(
    (p) => !proyectoComenzado(p) && p.estado !== "cancelado" && p.estado !== "entregado"
  )

  // Columna Avance: el sprint activo si el proyecto tiene tareas ahí; si no,
  // en qué anda en una frase.
  function avance(p: ProyectoListado): { barra: { hechas: number; total: number } | null; texto: string } {
    const c = conteos.get(p.id)
    const abiertas = c?.abiertas ? ` · ${c.abiertas} ${c.abiertas === 1 ? "tarea abierta" : "tareas abiertas"}` : ""
    if (sprint && c && c.enSprint > 0) {
      const pct = Math.round((c.hechasSprint / c.enSprint) * 100)
      return {
        barra: { hechas: c.hechasSprint, total: c.enSprint },
        texto: `${codigoSprint(sprint.numero)} · ${c.hechasSprint} de ${c.enSprint} (${pct}%)`,
      }
    }
    if (p.estado === "entregado") return { barra: null, texto: "Entregado" }
    if (p.estado === "cancelado") return { barra: null, texto: "No prosperó" }
    if (!proyectoComenzado(p)) return { barra: null, texto: `Sin comenzar${abiertas}` }
    if (p.fecha_inicio) return { barra: null, texto: `Arrancó el ${fechaCorta(p.fecha_inicio)}${abiertas}` }
    return { barra: null, texto: `Comenzado${abiertas}` }
  }

  return (
    <>
      <Encabezado
        titulo="Proyectos"
        acciones={<FiltrosProyectos clientes={clientes} socios={socios} />}
      />

      {proyectos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-input p-8 text-center text-muted-foreground">
          <p className="m-0 font-semibold text-foreground">Ningún proyecto para estos filtros</p>
          <p className="m-0 mt-1">Los proyectos se crean desde la ficha de su cliente o al graduar una idea.</p>
        </div>
      ) : (
        <>
          {/* Escritorio: tabla. */}
          <section className="overflow-x-auto rounded-xl border bg-card max-escritorio:hidden">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="text-left text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">
                  <th className="border-b py-3 pr-3 pl-5 font-semibold">Proyecto</th>
                  <th className="border-b p-3 font-semibold">Estado</th>
                  <th className="border-b p-3 font-semibold">Salud</th>
                  <th className="border-b p-3 font-semibold">Responsable</th>
                  <th className="w-[220px] border-b p-3 font-semibold">Avance</th>
                  <th className="border-b p-3 font-semibold">Fin</th>
                  <th className="border-b py-3 pr-5 pl-3 text-right font-semibold">Plata</th>
                </tr>
              </thead>
              <tbody>
                {proyectos.map((p) => {
                  const responsable = p.responsable_id ? nombreSocio.get(p.responsable_id) : null
                  const a = avance(p)
                  const fin = finProyecto(p)
                  const plata = plataProyecto(p, presupuesto.get(p.id) ?? null)
                  return (
                    <tr key={p.id} className="relative border-b last:border-b-0 hover:bg-muted">
                      <td className="py-3.5 pr-3 pl-5">
                        <Link
                          href={`/proyectos/${p.id}`}
                          className="font-semibold hover:underline after:absolute after:inset-0 after:content-['']"
                        >
                          {p.nombre}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {p.clientes?.nombre ?? "Interno"}
                        </span>
                      </td>
                      <td className="p-3">
                        <BadgeEstadoProyecto estado={p.estado} />
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <SaludTexto proyecto={p} hoy={hoy} />
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                          {responsable ? (
                            <span className="zq-avatar size-6 text-[10px]">{iniciales(responsable)}</span>
                          ) : (
                            <span className="size-6 rounded-full border border-dashed border-input" />
                          )}
                          <span className={cn(!responsable && "text-muted-foreground")}>
                            {responsable ?? "Sin responsable"}
                          </span>
                        </span>
                      </td>
                      <td className="p-3">
                        {a.barra ? (
                          <span className="flex flex-col gap-1.5">
                            <BarraAvance {...a.barra} />
                            <span className="zq-num text-xs text-muted-foreground">{a.texto}</span>
                          </span>
                        ) : (
                          <span className="text-[13px] text-muted-foreground">{a.texto}</span>
                        )}
                      </td>
                      <td className="zq-num p-3 whitespace-nowrap">
                        <span className="block">{fin.fecha}</span>
                        {fin.nota && (
                          <span className={cn("block text-xs", fin.tono ? `font-semibold ${TONO_TEXTO[fin.tono]}` : "text-muted-foreground")}>
                            {fin.nota}
                          </span>
                        )}
                      </td>
                      <td className="zq-num py-3 pr-5 pl-3 text-right whitespace-nowrap">
                        <span className={cn("block", plata.monto ? "font-semibold" : "text-muted-foreground")}>
                          {plata.monto ?? "Sin monto"}
                        </span>
                        {plata.nota && <span className="block text-xs text-muted-foreground">{plata.nota}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          {/* Celular: tarjetas. */}
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0 escritorio:hidden">
            {proyectos.map((p) => {
              const a = avance(p)
              const fin = finProyecto(p)
              return (
                <li key={p.id}>
                  <Link
                    href={`/proyectos/${p.id}`}
                    className="flex flex-col gap-2 rounded-[14px] border bg-card p-3.5 text-foreground no-underline"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{p.clientes?.nombre ?? "Interno"}</span>
                      <BadgeEstadoProyecto estado={p.estado} />
                    </span>
                    <strong className="text-base font-semibold">{p.nombre}</strong>
                    {a.barra && <BarraAvance {...a.barra} />}
                    <span className="flex justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{a.texto}</span>
                      {fin.fecha !== "—" && (
                        <span className={cn("font-semibold", fin.tono ? TONO_TEXTO[fin.tono] : "text-muted-foreground")}>
                          {fin.tono ? fin.nota : `Fin ${fin.fecha}`}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>

          {sinArrancar.length > 0 && (
            <AvisoSinArrancar
              proyectos={sinArrancar.map((p) => ({
                id: p.id,
                nombre: p.nombre,
                cliente: p.clientes?.nombre ?? "Interno",
                briefListo: briefProyectoCompleto(p),
              }))}
            />
          )}
        </>
      )}
    </>
  )
}

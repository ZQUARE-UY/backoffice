import { Encabezado } from "@/components/zq/encabezado"
import {
  codigoTarea,
  type ComentarioTarea,
  type Socio,
  type Sprint,
  type Tarea,
  type VersionTarea,
} from "@/lib/dominio"
import { rangoMes } from "@/lib/ceremonias"
import { paredEnZona, sumarDias } from "@/lib/disponibilidad"
import { createClient } from "@/lib/supabase/server"

import { Backlog } from "./backlog"
import { Calendario, type CeremoniaCalendario, type EventoCalendario } from "./calendario"
import { type ProyectoOpcion } from "./campos-tarea"
import { FiltrosTareas } from "./filtros-tareas"
import { NuevaTarea } from "./nueva-tarea"
import { resumirSprint } from "./resumen"
import { Tablero } from "./tablero"

// La columna Hecho es un registro reciente, no un archivo histórico: lo más
// viejo que esto deja de mostrarse (sigue en la base y en el MCP con
// `incluir_hechas`).
const DIAS_HECHAS_VISIBLES = 14

type ProyectoConCliente = {
  id: string
  nombre: string
  cliente_id: string | null
  clientes: { nombre: string } | null
}

export type NombreVista = "tablero" | "backlog" | "calendario"

export type ParamsTareas = {
  vista?: string
  cliente?: string
  proyecto?: string
  socio?: string
  tarea?: string
  mes?: string
}

// Hoy en la zona de la empresa (fuera del componente por la regla de pureza,
// como corteHechasVisibles).
function hoyEnZona(): string {
  return paredEnZona(Date.now()).fecha
}

// "YYYY-MM" válido o el mes actual (en la zona de la empresa).
function mesDeParam(param: string | undefined): string {
  if (param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param)) return param
  return hoyEnZona().slice(0, 7)
}

// Mismo parseo que el MCP: acepta "12", "ZQ-12", "zq12".
export function numeroDeParam(param: string | undefined): number | undefined {
  if (!param) return undefined
  const numero = Number(param.replace(/^zq-?/i, ""))
  return Number.isInteger(numero) && numero > 0 ? numero : undefined
}

// Fuera del componente por la regla de pureza del render (es un server
// component: acá el "ahora" por request es exactamente lo que se quiere).
function corteHechasVisibles(): string {
  return new Date(Date.now() - DIAS_HECHAS_VISIBLES * 86_400_000).toISOString()
}

// Las tres vistas de Tareas (Tablero · Backlog · Calendario) comparten
// encabezado, filtros y datos; cada una es su propia ruta.
export async function VistaTareas({
  vista,
  params,
}: {
  vista: NombreVista
  params: ParamsTareas
}) {
  const supabase = await createClient()
  const tareaAbierta = numeroDeParam(params.tarea)
  const vistaCalendario = vista === "calendario"
  const vistaBacklog = vista === "backlog"

  // Sprints abiertos (activo + planificados). Los cerrados son historial: sus
  // tarjetas hechas quedan archivadas ahí y no se muestran en el tablero —
  // esa es la "limpieza" al completar un sprint.
  const { data: sprintsData } = await supabase
    .from("sprints")
    .select("*")
    .is("deleted_at", null)
    .neq("estado", "cerrado")
    .order("numero", { ascending: true })
  const sprints = (sprintsData ?? []) as Sprint[]
  const sprintActivo = sprints.find((s) => s.estado === "activo") ?? null

  // El filtrado va en la query (no en el cliente): los índices parciales por
  // cliente/proyecto/responsable ya existen y el payload baja de "toda la base"
  // a lo que se ve.
  let tareasQuery = supabase
    .from("tareas")
    .select("*")
    .is("deleted_at", null)
    .order("orden", { ascending: true })
  if (vistaBacklog) {
    // Backlog libre + tarjetas de sprints planificados (también en `backlog`)
    // + las del sprint activo, que se muestran agrupadas bajo él.
    tareasQuery = sprintActivo
      ? tareasQuery.or(`estado.eq.backlog,sprint_id.eq.${sprintActivo.id}`)
      : tareasQuery.eq("estado", "backlog")
  } else {
    // El tablero es el sprint activo más lo que no tiene sprint. Las tarjetas
    // de sprints cerrados no se ven (los `.or` sucesivos se combinan con AND).
    tareasQuery = tareasQuery
      .neq("estado", "backlog")
      .or(`estado.neq.hecho,updated_at.gte.${corteHechasVisibles()}`)
      .or(
        sprintActivo
          ? `sprint_id.is.null,sprint_id.eq.${sprintActivo.id}`
          : "sprint_id.is.null"
      )
  }
  if (params.cliente) tareasQuery = tareasQuery.eq("cliente_id", params.cliente)
  if (params.proyecto) tareasQuery = tareasQuery.eq("proyecto_id", params.proyecto)
  if (params.socio) tareasQuery = tareasQuery.eq("asignado_a", params.socio)

  const [
    { data: tareasData },
    { data: sociosData },
    { data: clientesData },
    { data: proyectosData },
  ] = await Promise.all([
    tareasQuery,
    supabase
      .from("socios")
      .select("id, nombre, email")
      .is("deleted_at", null)
      .order("nombre"),
    supabase
      .from("clientes")
      .select("id, nombre")
      .is("deleted_at", null)
      .order("nombre"),
    supabase
      .from("proyectos")
      .select("id, nombre, cliente_id, clientes(nombre)")
      .is("deleted_at", null)
      .order("nombre"),
  ])

  const tareas = (tareasData ?? []) as Tarea[]

  // Avance del sprint activo para la barra del tablero. Se cuenta aparte
  // porque el tablero solo trae las hechas de los últimos días.
  let resumenActivo = null
  if (sprintActivo && vista === "tablero") {
    const { data } = await supabase
      .from("tareas")
      .select("estado, estimacion")
      .eq("sprint_id", sprintActivo.id)
      .is("deleted_at", null)
    resumenActivo = resumirSprint((data ?? []) as Tarea[])
  }

  // Solo los comentarios y versiones de las tarjetas visibles (dependen del
  // resultado de arriba, por eso van después del Promise.all).
  const idsVisibles = tareas.map((t) => t.id)
  const [{ data: comentariosData }, { data: versionesData }] = tareas.length
    ? await Promise.all([
        supabase
          .from("tareas_comentarios")
          .select("id, tarea_id, cuerpo, autor, autor_socio_id, created_at")
          .in("tarea_id", idsVisibles)
          .is("deleted_at", null)
          .order("created_at", { ascending: true }),
        supabase
          .from("tareas_versiones")
          .select("id, tarea_id, autor, created_at")
          .in("tarea_id", idsVisibles)
          .order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }]

  const comentarios = (comentariosData ?? []) as ComentarioTarea[]
  const versiones = (versionesData ?? []) as VersionTarea[]
  const socios = (sociosData ?? []) as Socio[]
  const clientes = (clientesData ?? []) as { id: string; nombre: string }[]
  const proyectos: ProyectoOpcion[] = (
    (proyectosData ?? []) as unknown as ProyectoConCliente[]
  ).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    cliente: p.clientes?.nombre ?? "Sin cliente",
    cliente_id: p.cliente_id,
  }))

  // Vista Calendario: sprints con fechas que tocan el mes (de cualquier
  // estado: los cerrados son el historial y los planificados lo que viene) y
  // las ceremonias del mes, con un día de margen a cada lado porque `inicio`
  // es un instante UTC y el mes se define en hora local.
  const mes = mesDeParam(params.mes)
  let sprintsMes: Sprint[] = []
  let ceremoniasMes: CeremoniaCalendario[] = []
  let eventosMes: EventoCalendario[] = []
  if (vistaCalendario) {
    const { desde, hasta } = rangoMes(mes)
    // El filtro por proyecto (o por cliente, vía sus proyectos) aplica a los
    // sprints; las ceremonias heredan el filtro por su sprint.
    const idsProyecto = params.proyecto
      ? [params.proyecto]
      : params.cliente
        ? proyectos.filter((p) => p.cliente_id === params.cliente).map((p) => p.id)
        : null
    let sprintsQuery = supabase
      .from("sprints")
      .select("*")
      .is("deleted_at", null)
      .not("fecha_inicio", "is", null)
      .not("fecha_fin", "is", null)
      .lte("fecha_inicio", hasta)
      .gte("fecha_fin", desde)
      .order("numero", { ascending: true })
    let ceremoniasQuery = supabase
      .from("ceremonias")
      .select("*, sprint:sprints!inner(id, numero, nombre, proyecto_id, estado)")
      .is("deleted_at", null)
      .is("sprint.deleted_at", null)
      .gte("inicio", `${sumarDias(desde, -1)}T00:00:00Z`)
      .lt("inicio", `${sumarDias(hasta, 2)}T00:00:00Z`)
      // Las dailies son ruido en una vista de mes: solo los hitos del sprint.
      .neq("tipo", "daily")
      .order("inicio", { ascending: true })
    // Arranques y entregas de proyectos que caen en el mes.
    let proyectosQuery = supabase
      .from("proyectos")
      .select("id, nombre, fecha_inicio, fecha_fin_estimada, clientes(nombre)")
      .is("deleted_at", null)
      .neq("estado", "cancelado")
      .or(
        `and(fecha_inicio.gte.${desde},fecha_inicio.lte.${hasta}),and(fecha_fin_estimada.gte.${desde},fecha_fin_estimada.lte.${hasta})`
      )
    // Tareas abiertas que vencen en el mes.
    let tareasMesQuery = supabase
      .from("tareas")
      .select("numero, titulo, fecha_limite")
      .is("deleted_at", null)
      .neq("estado", "hecho")
      .gte("fecha_limite", desde)
      .lte("fecha_limite", hasta)
    // Reuniones agendadas del mes (el mismo margen de un día que las ceremonias).
    let reunionesQuery = supabase
      .from("solicitudes_reunion")
      .select("id, titulo, inicio")
      .is("deleted_at", null)
      .eq("estado", "agendada")
      .gte("inicio", `${sumarDias(desde, -1)}T00:00:00Z`)
      .lt("inicio", `${sumarDias(hasta, 2)}T00:00:00Z`)
    if (idsProyecto) {
      sprintsQuery = sprintsQuery.in("proyecto_id", idsProyecto)
      ceremoniasQuery = ceremoniasQuery.in("sprint.proyecto_id", idsProyecto)
      proyectosQuery = proyectosQuery.in("id", idsProyecto)
    }
    if (params.cliente) {
      tareasMesQuery = tareasMesQuery.eq("cliente_id", params.cliente)
      reunionesQuery = reunionesQuery.eq("cliente_id", params.cliente)
    }
    if (params.proyecto) {
      tareasMesQuery = tareasMesQuery.eq("proyecto_id", params.proyecto)
      reunionesQuery = reunionesQuery.eq("proyecto_id", params.proyecto)
    }
    if (params.socio) tareasMesQuery = tareasMesQuery.eq("asignado_a", params.socio)
    const [
      { data: sprintsMesData },
      { data: ceremoniasData },
      { data: proyectosMes },
      { data: tareasMes },
      { data: reunionesMes },
    ] = await Promise.all([sprintsQuery, ceremoniasQuery, proyectosQuery, tareasMesQuery, reunionesQuery])
    sprintsMes = (sprintsMesData ?? []) as Sprint[]
    ceremoniasMes = (ceremoniasData ?? []) as unknown as CeremoniaCalendario[]

    const enMes = (fecha: string | null): fecha is string =>
      fecha !== null && fecha >= desde && fecha <= hasta
    type ProyectoMes = {
      id: string
      nombre: string
      fecha_inicio: string | null
      fecha_fin_estimada: string | null
      clientes: { nombre: string } | null
    }
    for (const p of (proyectosMes ?? []) as unknown as ProyectoMes[]) {
      if (enMes(p.fecha_inicio)) {
        eventosMes.push({ fecha: p.fecha_inicio, tipo: "proyecto", texto: `Arranca ${p.nombre}`, href: `/proyectos/${p.id}` })
      }
      if (enMes(p.fecha_fin_estimada)) {
        eventosMes.push({ fecha: p.fecha_fin_estimada, tipo: "proyecto", texto: `Entrega ${p.nombre}`, href: `/proyectos/${p.id}` })
      }
    }
    for (const t of (tareasMes ?? []) as { numero: number; titulo: string; fecha_limite: string }[]) {
      const codigo = codigoTarea(t.numero)
      eventosMes.push({ fecha: t.fecha_limite, tipo: "tarea", texto: `${codigo} ${t.titulo}`, href: `/tareas?tarea=${codigo}` })
    }
    for (const r of (reunionesMes ?? []) as { id: string; titulo: string; inicio: string }[]) {
      const { fecha, hora } = paredEnZona(Date.parse(r.inicio))
      eventosMes.push({ fecha, hora, tipo: "reunion", texto: r.titulo, href: `/reuniones/${r.id}` })
    }
    eventosMes = eventosMes.filter((e) => enMes(e.fecha))
  }

  // Las pestañas preservan los filtros activos.
  const filtros = new URLSearchParams()
  if (params.cliente) filtros.set("cliente", params.cliente)
  if (params.proyecto) filtros.set("proyecto", params.proyecto)
  if (params.socio) filtros.set("socio", params.socio)
  const qs = filtros.toString()
  const conFiltros = (ruta: string) => `${ruta}${qs ? `?${qs}` : ""}`
  const hrefBacklog = conFiltros("/tareas/backlog")

  return (
    <>
      <Encabezado
        titulo="Tareas"
        pestanas={[
          { href: conFiltros("/tareas"), label: "Tablero" },
          { href: hrefBacklog, label: "Backlog" },
          { href: conFiltros("/tareas/calendario"), label: "Calendario" },
        ]}
        acciones={
          <>
            <FiltrosTareas clientes={clientes} proyectos={proyectos} socios={socios} />
            <NuevaTarea
              socios={socios}
              clientes={clientes}
              proyectos={proyectos}
              sprints={sprints}
              estadoInicial={vistaBacklog ? "backlog" : "por_hacer"}
              sprintInicial={vistaBacklog ? null : (sprintActivo?.id ?? null)}
              escucharCrear
            />
          </>
        }
      />

      {vistaCalendario ? (
        <Calendario
          mes={mes}
          hoy={hoyEnZona()}
          sprints={sprintsMes}
          ceremonias={ceremoniasMes}
          eventos={eventosMes}
          proyectos={proyectos}
          qsFiltros={qs}
        />
      ) : vistaBacklog ? (
        <Backlog
          tareas={tareas}
          sprints={sprints}
          comentarios={comentarios}
          versiones={versiones}
          socios={socios}
          clientes={clientes}
          proyectos={proyectos}
          tareaAbierta={tareaAbierta}
        />
      ) : (
        <Tablero
          tareas={tareas}
          sprints={sprints}
          resumenActivo={resumenActivo}
          hrefBacklog={hrefBacklog}
          comentarios={comentarios}
          versiones={versiones}
          socios={socios}
          clientes={clientes}
          proyectos={proyectos}
          tareaAbierta={tareaAbierta}
        />
      )}
    </>
  )
}

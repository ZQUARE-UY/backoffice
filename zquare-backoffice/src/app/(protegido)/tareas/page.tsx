import Link from "next/link"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  type ComentarioTarea,
  type Socio,
  type Sprint,
  type Tarea,
  type VersionTarea,
} from "@/lib/dominio"
import { createClient } from "@/lib/supabase/server"

import { Backlog } from "./backlog"
import { type ProyectoOpcion } from "./campos-tarea"
import { FiltrosTareas } from "./filtros-tareas"
import { NuevaTarea } from "./nueva-tarea"
import { Tablero } from "./tablero"

export const metadata = { title: "Tareas" }

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

type Filtros = {
  vista?: string
  cliente?: string
  proyecto?: string
  socio?: string
  tarea?: string
}

// Mismo parseo que el MCP: acepta "12", "ZQ-12", "zq12".
function numeroDeParam(param: string | undefined): number | undefined {
  if (!param) return undefined
  const numero = Number(param.replace(/^zq-?/i, ""))
  return Number.isInteger(numero) && numero > 0 ? numero : undefined
}

// Fuera del componente por la regla de pureza del render (es un server
// component: acá el "ahora" por request es exactamente lo que se quiere).
function corteHechasVisibles(): string {
  return new Date(Date.now() - DIAS_HECHAS_VISIBLES * 86_400_000).toISOString()
}

export default async function TareasPage({
  searchParams,
}: {
  searchParams: Promise<Filtros>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const tareaAbierta = numeroDeParam(params.tarea)

  // Un deep link a una tarjeta del backlog debe abrirse en la vista Backlog
  // aunque la URL no lo pida: una query liviana solo cuando hay deep link.
  let vistaBacklog = params.vista === "backlog"
  if (tareaAbierta !== undefined && !vistaBacklog) {
    const { data } = await supabase
      .from("tareas")
      .select("estado")
      .eq("numero", tareaAbierta)
      .is("deleted_at", null)
      .maybeSingle()
    if (data?.estado === "backlog") vistaBacklog = true
  }

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

  // El toggle de vistas preserva los filtros activos.
  const filtros = new URLSearchParams()
  if (params.cliente) filtros.set("cliente", params.cliente)
  if (params.proyecto) filtros.set("proyecto", params.proyecto)
  if (params.socio) filtros.set("socio", params.socio)
  const qs = filtros.toString()
  const hrefTablero = `/tareas${qs ? `?${qs}` : ""}`
  filtros.set("vista", "backlog")
  const hrefBacklog = `/tareas?${filtros.toString()}`

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Tareas</h1>
          <p className="text-muted-foreground">
            {vistaBacklog
              ? "Backlog y sprints. Arrastrá tarjetas a un sprint para planificarlo, inicialo para que entren al tablero y completalo para dejar el tablero limpio."
              : "Tablero de la empresa. Arrastrá las tarjetas entre columnas o editalas para cambiarles el estado."}
          </p>
        </div>
        <NuevaTarea
          socios={socios}
          clientes={clientes}
          proyectos={proyectos}
          sprints={sprints}
          estadoInicial={vistaBacklog ? "backlog" : "por_hacer"}
          sprintInicial={vistaBacklog ? null : (sprintActivo?.id ?? null)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border p-0.5">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href={hrefTablero} />}
            className={cn(!vistaBacklog && "bg-muted")}
          >
            Tablero
          </Button>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href={hrefBacklog} />}
            className={cn(vistaBacklog && "bg-muted")}
          >
            Backlog
          </Button>
        </div>
        <FiltrosTareas clientes={clientes} proyectos={proyectos} socios={socios} />
      </div>

      {vistaBacklog ? (
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

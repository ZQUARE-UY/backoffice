import { FolderKanbanIcon } from "lucide-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  ESTADOS_PROYECTO,
  ESTADOS_PROYECTO_ORDEN,
  proyectoComenzado,
  saludProyecto,
  type Socio,
} from "@/lib/dominio"
import { createClient } from "@/lib/supabase/server"

import { FiltrosProyectos } from "./filtros-proyectos"
import { TarjetaProyecto, type ProyectoListado } from "./tarjeta-proyecto"

export const metadata = { title: "Proyectos" }

type Filtros = {
  estado?: string
  cliente?: string
  responsable?: string
  tipo?: string
  salud?: string
  arranque?: string
}

export default async function ProyectosPage({
  searchParams,
}: {
  searchParams: Promise<Filtros>
}) {
  const params = await searchParams
  const supabase = await createClient()

  // Estado, cliente, responsable y tipo se filtran en la query (hay índices).
  // Salud y arranque se calculan sobre el resultado: dependen de la fecha de
  // hoy y de una condición compuesta, y el volumen de proyectos de una
  // empresa de cuatro personas no justifica llevarlas a la base.
  let proyectosQuery = supabase
    .from("proyectos")
    .select("*, clientes(nombre)")
    .is("deleted_at", null)
    .order("fecha_fin_estimada", { nullsFirst: false })
    .order("nombre")
  if (params.estado) proyectosQuery = proyectosQuery.eq("estado", params.estado)
  if (params.cliente) proyectosQuery = proyectosQuery.eq("cliente_id", params.cliente)
  if (params.responsable)
    proyectosQuery = proyectosQuery.eq("responsable_id", params.responsable)
  if (params.tipo) proyectosQuery = proyectosQuery.eq("tipo", params.tipo)

  const [{ data: proyectosData }, { data: clientesData }, { data: sociosData }, { data: tareasData }] =
    await Promise.all([
      proyectosQuery,
      supabase.from("clientes").select("id, nombre").is("deleted_at", null).order("nombre"),
      supabase.from("socios").select("id, nombre, email").is("deleted_at", null).order("nombre"),
      supabase
        .from("tareas")
        .select("proyecto_id")
        .not("proyecto_id", "is", null)
        .neq("estado", "hecho")
        .is("deleted_at", null),
    ])

  const clientes = (clientesData ?? []) as { id: string; nombre: string }[]
  const socios = (sociosData ?? []) as Socio[]
  const nombreSocio = new Map(socios.map((s) => [s.id, s.nombre]))

  const tareasAbiertas = new Map<string, number>()
  for (const t of (tareasData ?? []) as { proyecto_id: string }[]) {
    tareasAbiertas.set(t.proyecto_id, (tareasAbiertas.get(t.proyecto_id) ?? 0) + 1)
  }

  // Un solo "ahora" por request, para que la salud de todas las tarjetas se
  // calcule contra la misma fecha.
  const hoy = new Date()

  const proyectos = ((proyectosData ?? []) as unknown as ProyectoListado[]).filter((p) => {
    if (params.salud && saludProyecto(p, hoy) !== params.salud) return false
    if (params.arranque === "sin_comenzar" && proyectoComenzado(p)) return false
    if (params.arranque === "comenzado" && !proyectoComenzado(p)) return false
    return true
  })

  // Los que esperan arranque van arriba de todo: es la pregunta que trae a
  // alguien a esta pantalla ("¿qué tengo que empezar?").
  const sinComenzar = proyectos.filter(
    (p) => !proyectoComenzado(p) && p.estado !== "cancelado" && p.estado !== "entregado"
  )

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Proyectos</h1>
        <p className="text-muted-foreground">
          Seguimiento por estado. Los que todavía no arrancaron se comienzan con
          Claude: lee los documentos del proyecto, entrevista y deja creadas las
          tareas iniciales.
        </p>
      </div>

      <FiltrosProyectos clientes={clientes} socios={socios} />

      {proyectos.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderKanbanIcon />
            </EmptyMedia>
            <EmptyTitle>Ningún proyecto para estos filtros</EmptyTitle>
            <EmptyDescription>
              Los proyectos se crean desde la ficha de su cliente, o al graduar
              una idea del banco.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {sinComenzar.length > 0 && !params.arranque && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">Esperando arranque</h2>
                <span className="text-sm text-muted-foreground">
                  {sinComenzar.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sinComenzar.map((proyecto) => (
                  <TarjetaProyecto
                    key={proyecto.id}
                    proyecto={proyecto}
                    responsable={
                      proyecto.responsable_id
                        ? (nombreSocio.get(proyecto.responsable_id) ?? null)
                        : null
                    }
                    tareasAbiertas={tareasAbiertas.get(proyecto.id) ?? 0}
                    hoy={hoy}
                    mostrarEstado
                  />
                ))}
              </div>
            </section>
          )}

          {ESTADOS_PROYECTO_ORDEN.map((estado) => {
            const delEstado = proyectos.filter((p) => p.estado === estado)
            if (delEstado.length === 0) return null
            return (
              <section key={estado} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium">
                    {ESTADOS_PROYECTO[estado].label}
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    {delEstado.length}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {delEstado.map((proyecto) => (
                    <TarjetaProyecto
                      key={proyecto.id}
                      proyecto={proyecto}
                      responsable={
                        proyecto.responsable_id
                          ? (nombreSocio.get(proyecto.responsable_id) ?? null)
                          : null
                      }
                      tareasAbiertas={tareasAbiertas.get(proyecto.id) ?? 0}
                      hoy={hoy}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </>
      )}
    </>
  )
}


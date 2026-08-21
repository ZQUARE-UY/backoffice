"use client"

import { useOptimistic, useState, useTransition } from "react"
import Link from "next/link"
import { CalendarIcon, FlagIcon, UserIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  codigoTarea,
  ESTADOS_TABLERO,
  ESTADOS_TAREA,
  PRIORIDADES_TAREA,
  tareaDesarrollada,
  type ComentarioTarea,
  type EstadoTarea,
  type Socio,
  type Sprint,
  type Tarea,
  type VersionTarea,
} from "@/lib/dominio"

import { moverTarea } from "./actions"
import { type ClienteOpcion, type ProyectoOpcion } from "./campos-tarea"
import { DetalleTarea } from "./detalle-tarea"
import { NuevaTarea } from "./nueva-tarea"
import { ordenEntre } from "./orden"
import { EncabezadoSprint, resumirSprint } from "./sprints"

type Movimiento = { id: string; estado: EstadoTarea; orden: number }

export function Tablero({
  tareas,
  comentarios,
  versiones,
  socios,
  clientes,
  proyectos,
  sprints,
  hrefBacklog,
  tareaAbierta,
}: {
  tareas: Tarea[]
  comentarios: ComentarioTarea[]
  versiones: VersionTarea[]
  socios: Socio[]
  clientes: ClienteOpcion[]
  proyectos: ProyectoOpcion[]
  // Sprints abiertos (activo + planificados). El tablero muestra el activo.
  sprints: Sprint[]
  hrefBacklog: string
  tareaAbierta?: number
}) {
  const [, iniciarTransicion] = useTransition()
  const [vista, moverOptimista] = useOptimistic(
    tareas,
    (actual: Tarea[], mov: Movimiento) =>
      actual.map((t) =>
        t.id === mov.id ? { ...t, estado: mov.estado, orden: mov.orden } : t
      )
  )
  const [arrastrada, setArrastrada] = useState<string | null>(null)
  const [columnaActiva, setColumnaActiva] = useState<EstadoTarea | null>(null)

  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]))
  const nombreSocio = new Map(socios.map((s) => [s.id, s.nombre]))

  const activo = sprints.find((s) => s.estado === "activo") ?? null
  const planificados = sprints.filter((s) => s.estado === "planificado")

  function columna(estado: EstadoTarea) {
    return vista
      .filter((t) => t.estado === estado)
      .sort((a, b) => Number(a.orden) - Number(b.orden))
  }

  // `indice` es la posición donde se suelta dentro de la columna destino, ya
  // sin contar la tarjeta que se está moviendo. El id sale del dataTransfer y
  // el estado local es el respaldo: así el drop no depende de que el render
  // del dragstart haya llegado.
  function soltar(estado: EstadoTarea, indice: number, idSoltado?: string) {
    const id = idSoltado || arrastrada
    setArrastrada(null)
    setColumnaActiva(null)
    if (!id) return

    const destino = columna(estado).filter((t) => t.id !== id)
    const orden = ordenEntre(destino[indice - 1], destino[indice])
    const tarea = vista.find((t) => t.id === id)
    if (tarea && tarea.estado === estado && Number(tarea.orden) === orden) return

    iniciarTransicion(async () => {
      moverOptimista({ id, estado, orden })
      await moverTarea(id, estado, orden)
    })
  }

  return (
    // `flex-1 min-h-0`: cuando la página fija su alto al viewport (vista
    // Tablero), el tablero toma lo que queda y las columnas scrollean adentro.
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Banner del sprint: el tablero ES el sprint activo (más lo que no tiene
          sprint). Sin activo, invita a iniciar el planificado o a crear uno. */}
      {activo ? (
        <div className="rounded-xl border bg-muted/30 px-3 py-2">
          <EncabezadoSprint
            sprint={activo}
            resumen={resumirSprint(vista.filter((t) => t.sprint_id === activo.id))}
            sprintsPlanificados={planificados}
            proyectos={proyectos}
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground">
          <FlagIcon className="size-4" />
          {planificados.length > 0 ? (
            <span>
              Sin sprint activo. {planificados[0].nombre} está planificado
              {planificados.length > 1 && ` (y ${planificados.length - 1} más)`}.
            </span>
          ) : (
            <span>Sin sprint activo: el tablero es un flujo continuo.</span>
          )}
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={hrefBacklog} />}
            className="ml-auto"
          >
            {planificados.length > 0 ? "Ir a iniciarlo" : "Planificar un sprint"}
          </Button>
        </div>
      )}

    {/* Scroll interno por columna: cada una tiene su propia barra, así una
        columna larga (Hecho) no obliga a scrollear toda la página para llegar
        al resto. El encabezado y el "Agregar tarjeta" quedan fijos. */}
    <div className="grid min-h-0 flex-1 gap-4 md:auto-rows-fr md:grid-cols-2 xl:grid-cols-4">
      {ESTADOS_TABLERO.map((estado) => {
        const items = columna(estado)
        return (
          <div
            key={estado}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = "move"
              setColumnaActiva(estado)
            }}
            onDragLeave={() => setColumnaActiva((c) => (c === estado ? null : c))}
            onDrop={(e) => {
              e.preventDefault()
              // Soltar en el fondo de la columna: la tarjeta va al final.
              const id = e.dataTransfer.getData("text/plain") || arrastrada
              if (!id) return
              soltar(estado, items.filter((t) => t.id !== id).length, id)
            }}
            className={cn(
              "flex min-h-40 flex-col gap-2 overflow-hidden rounded-xl border bg-muted/30 p-2 transition-colors",
              columnaActiva === estado && arrastrada && "border-primary bg-muted"
            )}
          >
            <div className="flex shrink-0 items-center justify-between px-1 py-1">
              <span className="text-sm font-medium">
                {ESTADOS_TAREA[estado].label}
              </span>
              <span className="text-xs text-muted-foreground">{items.length}</span>
            </div>

            {/* -mx-2 px-2: el área scrolleable llega hasta el borde de la
                columna para que la barra quede pegada al borde y las sombras
                de las tarjetas no se recorten. */}
            <div className="-mx-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-0.5">
            {items.map((tarea) => (
              <div
                key={tarea.id}
                draggable
                onDragStart={(e) => {
                  setArrastrada(tarea.id)
                  // Firefox no dispara el drop si el drag no lleva datos.
                  e.dataTransfer.setData("text/plain", tarea.id)
                  e.dataTransfer.effectAllowed = "move"
                }}
                onDragEnd={() => {
                  setArrastrada(null)
                  setColumnaActiva(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  // Soltar sobre una tarjeta: la movida se inserta antes.
                  const id = e.dataTransfer.getData("text/plain") || arrastrada
                  if (!id || id === tarea.id) {
                    setArrastrada(null)
                    setColumnaActiva(null)
                    return
                  }
                  const destino = items.filter((t) => t.id !== id)
                  soltar(
                    estado,
                    destino.findIndex((t) => t.id === tarea.id),
                    id
                  )
                }}
                className={cn(
                  "cursor-grab active:cursor-grabbing",
                  arrastrada === tarea.id && "opacity-40"
                )}
              >
                <DetalleTarea
                  tarea={tarea}
                  sprints={sprints}
                  comentarios={comentarios.filter((c) => c.tarea_id === tarea.id)}
                  versiones={versiones.filter((v) => v.tarea_id === tarea.id)}
                  socios={socios}
                  clientes={clientes}
                  proyectos={proyectos}
                  abiertoInicial={tarea.numero === tareaAbierta}
                >
                  <Card className="gap-2 p-3 hover:border-primary/50">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{tarea.titulo}</span>
                      <Badge
                        variant={PRIORIDADES_TAREA[tarea.prioridad].variant}
                        className="shrink-0"
                      >
                        {PRIORIDADES_TAREA[tarea.prioridad].label}
                      </Badge>
                    </div>
                    {tarea.etiquetas.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tarea.etiquetas.map((e) => (
                          <Badge key={e} variant="outline" className="text-xs">
                            {e}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5 font-mono">
                        {codigoTarea(tarea.numero)}
                        {!tareaDesarrollada(tarea) && tarea.estado !== "hecho" && (
                          // Punto ámbar: falta el resultado esperado, así que
                          // todavía no es resoluble.
                          <span
                            title="Sin desarrollar: falta el resultado esperado"
                            className="size-1.5 rounded-full bg-amber-500"
                          />
                        )}
                      </span>
                      {tarea.asignado_a && nombreSocio.has(tarea.asignado_a) && (
                        <span className="flex items-center gap-1">
                          <UserIcon className="size-3" />
                          {nombreSocio.get(tarea.asignado_a)}
                        </span>
                      )}
                      {tarea.fecha_limite && (
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="size-3" />
                          {tarea.fecha_limite}
                        </span>
                      )}
                      {tarea.cliente_id && nombreCliente.has(tarea.cliente_id) && (
                        <span>{nombreCliente.get(tarea.cliente_id)}</span>
                      )}
                    </div>
                  </Card>
                </DetalleTarea>
              </div>
            ))}
            </div>

            <NuevaTarea
              socios={socios}
              clientes={clientes}
              proyectos={proyectos}
              sprints={sprints}
              estadoInicial={estado}
              sprintInicial={activo?.id ?? null}
              variante="columna"
            />
          </div>
        )
      })}
    </div>
    </div>
  )
}

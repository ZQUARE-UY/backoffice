"use client"

import { useOptimistic, useState, useTransition } from "react"
import { ArrowRightIcon, CalendarIcon, UserIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  briefVacio,
  codigoTarea,
  PRIORIDADES_TAREA,
  type ComentarioTarea,
  type Socio,
  type Tarea,
  type VersionTarea,
} from "@/lib/dominio"

import { moverTarea, pasarAlTablero } from "./actions"
import { type ClienteOpcion, type ProyectoOpcion } from "./campos-tarea"
import { DetalleTarea } from "./detalle-tarea"
import { NuevaTarea } from "./nueva-tarea"
import { ordenEntre } from "./orden"

// Reordenar (drag) o sacar del backlog ("Pasar al tablero").
type Cambio = { id: string; orden: number } | { id: string; quitar: true }

// El backlog es una sola columna: la lista priorizada de lo que todavía no se
// comprometió. Mismo drag & drop del tablero, sin columna destino.
export function Backlog({
  tareas,
  comentarios,
  versiones,
  socios,
  clientes,
  proyectos,
  tareaAbierta,
}: {
  tareas: Tarea[]
  comentarios: ComentarioTarea[]
  versiones: VersionTarea[]
  socios: Socio[]
  clientes: ClienteOpcion[]
  proyectos: ProyectoOpcion[]
  tareaAbierta?: number
}) {
  const [, iniciarTransicion] = useTransition()
  const [vista, aplicarOptimista] = useOptimistic(
    tareas,
    (actual: Tarea[], cambio: Cambio) =>
      "quitar" in cambio
        ? actual.filter((t) => t.id !== cambio.id)
        : actual.map((t) =>
            t.id === cambio.id ? { ...t, orden: cambio.orden } : t
          )
  )
  const [arrastrada, setArrastrada] = useState<string | null>(null)

  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]))
  const nombreSocio = new Map(socios.map((s) => [s.id, s.nombre]))

  const items = [...vista].sort((a, b) => Number(a.orden) - Number(b.orden))

  // `indice` es la posición donde se suelta, ya sin contar la fila movida.
  function soltar(indice: number, idSoltado?: string) {
    const id = idSoltado || arrastrada
    setArrastrada(null)
    if (!id) return

    const destino = items.filter((t) => t.id !== id)
    const orden = ordenEntre(destino[indice - 1], destino[indice])
    const tarea = vista.find((t) => t.id === id)
    if (tarea && Number(tarea.orden) === orden) return

    iniciarTransicion(async () => {
      aplicarOptimista({ id, orden })
      await moverTarea(id, "backlog", orden)
    })
  }

  function pasar(id: string) {
    iniciarTransicion(async () => {
      aplicarOptimista({ id, quitar: true })
      await pasarAlTablero(id)
    })
  }

  return (
    <div
      className="flex max-w-3xl flex-col gap-2"
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
      }}
      onDrop={(e) => {
        e.preventDefault()
        // Soltar fuera de las filas: la tarjeta va al final.
        const id = e.dataTransfer.getData("text/plain") || arrastrada
        if (!id) return
        soltar(items.filter((t) => t.id !== id).length, id)
      }}
    >
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
          onDragEnd={() => setArrastrada(null)}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            // Soltar sobre una fila: la movida se inserta antes.
            const id = e.dataTransfer.getData("text/plain") || arrastrada
            if (!id || id === tarea.id) {
              setArrastrada(null)
              return
            }
            const destino = items.filter((t) => t.id !== id)
            soltar(
              destino.findIndex((t) => t.id === tarea.id),
              id
            )
          }}
          className={cn(
            "flex items-center gap-2 cursor-grab active:cursor-grabbing",
            arrastrada === tarea.id && "opacity-40"
          )}
        >
          <div className="min-w-0 flex-1">
            <DetalleTarea
              tarea={tarea}
              comentarios={comentarios.filter((c) => c.tarea_id === tarea.id)}
              versiones={versiones.filter((v) => v.tarea_id === tarea.id)}
              socios={socios}
              clientes={clientes}
              proyectos={proyectos}
              abiertoInicial={tarea.numero === tareaAbierta}
            >
              <Card className="flex-row items-center gap-3 p-3 hover:border-primary/50">
                <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  {codigoTarea(tarea.numero)}
                  {briefVacio(tarea) && (
                    // Punto ámbar: la tarjeta todavía no tiene brief.
                    <span
                      title="Sin desarrollar"
                      className="size-1.5 rounded-full bg-amber-500"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {tarea.titulo}
                </span>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                  {tarea.cliente_id && nombreCliente.has(tarea.cliente_id) && (
                    <span className="hidden sm:inline">
                      {nombreCliente.get(tarea.cliente_id)}
                    </span>
                  )}
                  {tarea.asignado_a && nombreSocio.has(tarea.asignado_a) && (
                    <span className="hidden items-center gap-1 sm:flex">
                      <UserIcon className="size-3" />
                      {nombreSocio.get(tarea.asignado_a)}
                    </span>
                  )}
                  {tarea.fecha_limite && (
                    <span className="hidden items-center gap-1 sm:flex">
                      <CalendarIcon className="size-3" />
                      {tarea.fecha_limite}
                    </span>
                  )}
                  <Badge variant={PRIORIDADES_TAREA[tarea.prioridad].variant}>
                    {PRIORIDADES_TAREA[tarea.prioridad].label}
                  </Badge>
                </div>
              </Card>
            </DetalleTarea>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            title="Pasar al tablero (a Por hacer)"
            onClick={() => pasar(tarea.id)}
          >
            <ArrowRightIcon data-icon="inline-start" />
            <span className="hidden md:inline">Al tablero</span>
          </Button>
        </div>
      ))}

      {items.length === 0 && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No hay tarjetas en el backlog.
        </p>
      )}

      <NuevaTarea
        socios={socios}
        clientes={clientes}
        proyectos={proyectos}
        estadoInicial="backlog"
        variante="columna"
      />
    </div>
  )
}

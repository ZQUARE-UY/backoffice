"use client"

import { useOptimistic, useState, useTransition } from "react"
import { CalendarIcon, UserIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  codigoTarea,
  ESTADOS_TAREA,
  ESTADOS_TAREA_ORDEN,
  PRIORIDADES_TAREA,
  type ComentarioTarea,
  type EstadoTarea,
  type Socio,
  type Tarea,
} from "@/lib/dominio"

import { moverTarea } from "./actions"
import { type ClienteOpcion, type ProyectoOpcion } from "./campos-tarea"
import { DetalleTarea } from "./detalle-tarea"
import { NuevaTarea } from "./nueva-tarea"

type Movimiento = { id: string; estado: EstadoTarea; orden: number }

// `orden` es numeric justamente para esto: al soltar entre dos tarjetas se
// guarda el punto medio de sus `orden` y solo se escribe la fila movida.
function ordenEntre(anterior: Tarea | undefined, siguiente: Tarea | undefined) {
  if (anterior && siguiente) return (Number(anterior.orden) + Number(siguiente.orden)) / 2
  if (anterior) return Number(anterior.orden) + 1
  if (siguiente) return Number(siguiente.orden) - 1
  return 0
}

export function Tablero({
  tareas,
  comentarios,
  socios,
  clientes,
  proyectos,
}: {
  tareas: Tarea[]
  comentarios: ComentarioTarea[]
  socios: Socio[]
  clientes: ClienteOpcion[]
  proyectos: ProyectoOpcion[]
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
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {ESTADOS_TAREA_ORDEN.map((estado) => {
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
              "flex min-h-40 flex-col gap-2 rounded-xl border bg-muted/30 p-2 transition-colors",
              columnaActiva === estado && arrastrada && "border-primary bg-muted"
            )}
          >
            <div className="flex items-center justify-between px-1 py-1">
              <span className="text-sm font-medium">
                {ESTADOS_TAREA[estado].label}
              </span>
              <span className="text-xs text-muted-foreground">{items.length}</span>
            </div>

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
                  comentarios={comentarios.filter((c) => c.tarea_id === tarea.id)}
                  socios={socios}
                  clientes={clientes}
                  proyectos={proyectos}
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
                      <span className="font-mono">{codigoTarea(tarea.numero)}</span>
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

            <NuevaTarea
              socios={socios}
              clientes={clientes}
              proyectos={proyectos}
              estadoInicial={estado}
              variante="columna"
            />
          </div>
        )
      })}
    </div>
  )
}

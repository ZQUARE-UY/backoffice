"use client"

import { useOptimistic, useState, useTransition } from "react"
import {
  ArrowRightIcon,
  CalendarIcon,
  ChevronsUpDownIcon,
  FlagIcon,
  UserIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  codigoTarea,
  ESTADOS_TAREA,
  ESTADOS_TAREA_ORDEN,
  PRIORIDADES_TAREA,
  tareaDesarrollada,
  type ComentarioTarea,
  type Socio,
  type Sprint,
  type Tarea,
  type VersionTarea,
} from "@/lib/dominio"

import { moverASprint, moverTarea, pasarAlTablero } from "./actions"
import { type ClienteOpcion, type ProyectoOpcion } from "./campos-tarea"
import { DetalleTarea } from "./detalle-tarea"
import { NuevaTarea } from "./nueva-tarea"
import { ordenEntre } from "./orden"
import { EncabezadoSprint, NuevoSprint, resumirSprint } from "./sprints"

// Cambios optimistas: reordenar, sacar del backlog ("Al tablero") o cambiar de
// sección (sprint ↔ backlog).
type Cambio =
  | { id: string; orden: number }
  | { id: string; quitar: true }
  | { id: string; sprint_id: string | null; estado: Tarea["estado"] }

// Clave de sección para el drag & drop: un sprint (su id) o el backlog libre.
const BACKLOG = "backlog"

// La vista Backlog al estilo Jira: arriba los sprints (el activo y los
// planificados) con sus tarjetas, abajo el backlog libre priorizado. Se
// arrastra entre secciones para armar un sprint y dentro de una sección para
// priorizar. El sprint activo se ve pero no se reordena acá (su orden vive en
// el tablero).
export function Backlog({
  tareas,
  sprints,
  comentarios,
  versiones,
  socios,
  clientes,
  proyectos,
  tareaAbierta,
}: {
  tareas: Tarea[]
  sprints: Sprint[]
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
    (actual: Tarea[], cambio: Cambio) => {
      if ("quitar" in cambio) return actual.filter((t) => t.id !== cambio.id)
      if ("sprint_id" in cambio)
        return actual.map((t) =>
          t.id === cambio.id
            ? { ...t, sprint_id: cambio.sprint_id, estado: cambio.estado }
            : t
        )
      return actual.map((t) =>
        t.id === cambio.id ? { ...t, orden: cambio.orden } : t
      )
    }
  )
  const [arrastrada, setArrastrada] = useState<string | null>(null)
  const [seccionActiva, setSeccionActiva] = useState<string | null>(null)

  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]))
  const nombreSocio = new Map(socios.map((s) => [s.id, s.nombre]))

  const activo = sprints.find((s) => s.estado === "activo") ?? null
  const planificados = sprints.filter((s) => s.estado === "planificado")
  const siguienteNumero = Math.max(0, ...sprints.map((s) => s.numero)) + 1

  const rango = (estado: Tarea["estado"]) => ESTADOS_TAREA_ORDEN.indexOf(estado)

  function seccion(clave: string): Tarea[] {
    if (clave === BACKLOG) {
      return vista
        .filter((t) => !t.sprint_id && t.estado === "backlog")
        .sort((a, b) => Number(a.orden) - Number(b.orden))
    }
    const items = vista.filter((t) => t.sprint_id === clave)
    // El sprint activo se muestra en orden de tablero: columna más avanzada
    // primero. Los planificados, por prioridad.
    return activo?.id === clave
      ? items.sort(
          (a, b) => rango(b.estado) - rango(a.estado) || Number(a.orden) - Number(b.orden)
        )
      : items.sort((a, b) => Number(a.orden) - Number(b.orden))
  }

  function seccionDe(tarea: Tarea): string {
    return tarea.sprint_id ?? BACKLOG
  }

  // Soltar en una sección: si es la misma, reordena (punto medio entre las
  // vecinas, una sola fila); si es otra, la tarjeta cambia de sprint (y el
  // server acomoda la columna). `indice` es la posición sin contar la movida.
  function soltar(clave: string, indice: number, idSoltado?: string) {
    const id = idSoltado || arrastrada
    setArrastrada(null)
    setSeccionActiva(null)
    if (!id) return
    const tarea = vista.find((t) => t.id === id)
    if (!tarea) return

    if (seccionDe(tarea) !== clave) {
      const sprintId = clave === BACKLOG ? null : clave
      const estado: Tarea["estado"] =
        sprintId && activo?.id === sprintId ? "por_hacer" : "backlog"
      iniciarTransicion(async () => {
        aplicarOptimista({ id, sprint_id: sprintId, estado })
        await moverASprint(id, sprintId)
      })
      return
    }

    // Dentro del sprint activo el orden es el del tablero: no se reordena acá.
    if (activo && clave === activo.id) return

    const destino = seccion(clave).filter((t) => t.id !== id)
    const orden = ordenEntre(destino[indice - 1], destino[indice])
    if (Number(tarea.orden) === orden) return
    iniciarTransicion(async () => {
      aplicarOptimista({ id, orden })
      await moverTarea(id, "backlog", orden)
    })
  }

  function pasar(id: string) {
    iniciarTransicion(async () => {
      if (activo) aplicarOptimista({ id, sprint_id: activo.id, estado: "por_hacer" })
      else aplicarOptimista({ id, quitar: true })
      await pasarAlTablero(id)
    })
  }

  function cambiarSprint(tarea: Tarea, sprintId: string | null) {
    const estado: Tarea["estado"] =
      sprintId && activo?.id === sprintId ? "por_hacer" : "backlog"
    iniciarTransicion(async () => {
      aplicarOptimista({ id: tarea.id, sprint_id: sprintId, estado })
      await moverASprint(tarea.id, sprintId)
    })
  }

  function propsZona(clave: string, items: Tarea[]) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
        setSeccionActiva(clave)
      },
      onDragLeave: () => setSeccionActiva((s) => (s === clave ? null : s)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault()
        // Soltar fuera de las filas: la tarjeta va al final.
        const id = e.dataTransfer.getData("text/plain") || arrastrada
        if (!id) return
        soltar(clave, items.filter((t) => t.id !== id).length, id)
      },
      className: cn(
        "flex flex-col gap-2 rounded-xl border p-2 transition-colors",
        seccionActiva === clave && arrastrada && "border-primary bg-muted"
      ),
    }
  }

  function fila(tarea: Tarea, clave: string, items: Tarea[]) {
    const enSprintActivo = Boolean(activo && tarea.sprint_id === activo.id)
    return (
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
          setSeccionActiva(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          // Soltar sobre una fila: la movida se inserta antes.
          const id = e.dataTransfer.getData("text/plain") || arrastrada
          if (!id || id === tarea.id) {
            setArrastrada(null)
            setSeccionActiva(null)
            return
          }
          const destino = items.filter((t) => t.id !== id)
          soltar(clave, destino.findIndex((t) => t.id === tarea.id), id)
        }}
        className={cn(
          "flex items-center gap-2 cursor-grab active:cursor-grabbing",
          arrastrada === tarea.id && "opacity-40"
        )}
      >
        <div className="min-w-0 flex-1">
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
            <Card className="flex-row items-center gap-3 p-3 hover:border-primary/50">
              <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
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
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm font-medium",
                  tarea.estado === "hecho" && "text-muted-foreground line-through"
                )}
              >
                {tarea.titulo}
              </span>
              <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                {enSprintActivo && (
                  <Badge variant={ESTADOS_TAREA[tarea.estado].variant}>
                    {ESTADOS_TAREA[tarea.estado].label}
                  </Badge>
                )}
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
                {tarea.estimacion && (
                  <span
                    title={`${tarea.estimacion} puntos`}
                    className="rounded-full bg-muted px-1.5 font-mono"
                  >
                    {tarea.estimacion}
                  </span>
                )}
                <Badge variant={PRIORIDADES_TAREA[tarea.prioridad].variant}>
                  {PRIORIDADES_TAREA[tarea.prioridad].label}
                </Badge>
              </div>
            </Card>
          </DetalleTarea>
        </div>

        {/* Mover a un sprint (o sacarla). Sin sprints creados, queda el botón
            "Al tablero" de siempre. */}
        {sprints.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  title="Mover a un sprint"
                >
                  <FlagIcon data-icon="inline-start" />
                  <span className="hidden md:inline">
                    {tarea.sprint_id ? "Mover" : "Sprint"}
                  </span>
                  <ChevronsUpDownIcon data-icon="inline-end" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Mover a…</DropdownMenuLabel>
                {sprints
                  .filter((s) => s.id !== tarea.sprint_id)
                  .map((s) => (
                    <DropdownMenuItem key={s.id} onClick={() => cambiarSprint(tarea, s.id)}>
                      <FlagIcon />
                      {s.nombre}
                      {s.estado === "activo" && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          al tablero
                        </span>
                      )}
                    </DropdownMenuItem>
                  ))}
                {tarea.sprint_id && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => cambiarSprint(tarea, null)}>
                      Quitar del sprint (al backlog)
                    </DropdownMenuItem>
                  </>
                )}
                {!tarea.sprint_id && !activo && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => pasar(tarea.id)}>
                      <ArrowRightIcon />
                      Al tablero sin sprint
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
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
        )}
      </div>
    )
  }

  const backlogLibre = seccion(BACKLOG)

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {/* Sprints: el activo primero, después los planificados. */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Sprints</span>
          <NuevoSprint proyectos={proyectos} siguienteNumero={siguienteNumero} />
        </div>
        {sprints.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            <p>
              Todavía no hay sprints. Creá uno, arrastrale tarjetas del backlog
              e inicialo: entran al tablero, y al completarlo el tablero queda
              limpio para el siguiente.
            </p>
            <NuevoSprint
              proyectos={proyectos}
              siguienteNumero={siguienteNumero}
              variante="vacio"
            />
          </div>
        )}
        {[...(activo ? [activo] : []), ...planificados].map((sprint) => {
          const items = seccion(sprint.id)
          return (
            <div key={sprint.id} {...propsZona(sprint.id, items)}>
              <div className="px-1 py-1">
                <EncabezadoSprint
                  sprint={sprint}
                  resumen={resumirSprint(items)}
                  sprintsPlanificados={planificados}
                  proyectos={proyectos}
                />
              </div>
              {items.map((t) => fila(t, sprint.id, items))}
              {items.length === 0 && (
                <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Arrastrá tarjetas del backlog acá para planificar el sprint.
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Backlog libre: lo que no está comprometido en ningún sprint. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-sm font-medium">Backlog</span>
          <span className="text-xs text-muted-foreground">{backlogLibre.length}</span>
        </div>
        <div {...propsZona(BACKLOG, backlogLibre)}>
          {backlogLibre.map((t) => fila(t, BACKLOG, backlogLibre))}
          {backlogLibre.length === 0 && (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No hay tarjetas en el backlog.
            </p>
          )}
          <NuevaTarea
            socios={socios}
            clientes={clientes}
            proyectos={proyectos}
            sprints={sprints}
            estadoInicial="backlog"
            variante="columna"
          />
        </div>
      </div>
    </div>
  )
}

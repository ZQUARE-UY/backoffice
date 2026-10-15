"use client"

import { useOptimistic, useState, useTransition } from "react"
import Link from "next/link"
import { Popover } from "@base-ui/react/popover"
import { ChevronDownIcon, GripVerticalIcon, SearchIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { useEsCelular } from "@/hooks/use-mobile"
import {
  codigoSprint,
  codigoTarea,
  type ComentarioTarea,
  type PrioridadTarea,
  type Socio,
  type Sprint,
  type Tarea,
  type VersionTarea,
} from "@/lib/dominio"
import { cn } from "@/lib/utils"

import { moverASprint, moverTarea, pasarAlTablero } from "./actions"
import { type ClienteOpcion, type ProyectoOpcion } from "./campos-tarea"
import { DetalleTarea } from "./detalle-tarea"
import { ordenEntre } from "./orden"
import { resumirSprint } from "./resumen"
import { IniciarSprint, MenuSprint, NuevoSprint } from "./sprints"
import { nombreSinNumero } from "./tarjeta"

// Cambios optimistas: reordenar, sacar del backlog ("Al tablero") o cambiar de
// sprint.
type Cambio =
  | { id: string; orden: number }
  | { id: string; quitar: true }
  | { id: string; sprint_id: string | null; estado: Tarea["estado"] }

const TODOS = "todos"
const SIN_PROYECTO = "sin"

// Punto de urgencia de cada fila.
const COLOR_PRIORIDAD: Record<PrioridadTarea, string> = {
  urgente: "bg-negativo",
  alta: "bg-aviso",
  media: "bg-input",
  baja: "bg-input",
}

// Cuadradito de color de cada proyecto (por orden, se repite si hay más).
const COLORES_PROYECTO = ["bg-lima", "bg-arena", "bg-[#d8d6c9]", "bg-carbon dark:bg-crema", "bg-muted-foreground"]

// Backlog: a la izquierda las tareas sin sprint del proyecto elegido; a la
// derecha (fija) el panel del próximo sprint, donde se arrastran o se suman
// con "Al sprint →", y se inicia.
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
  const esCelular = useEsCelular()
  const [, iniciarTransicion] = useTransition()
  const [vista, aplicarOptimista] = useOptimistic(tareas, (actual: Tarea[], cambio: Cambio) => {
    if ("quitar" in cambio) return actual.filter((t) => t.id !== cambio.id)
    if ("sprint_id" in cambio)
      return actual.map((t) =>
        t.id === cambio.id ? { ...t, sprint_id: cambio.sprint_id, estado: cambio.estado } : t
      )
    return actual.map((t) => (t.id === cambio.id ? { ...t, orden: cambio.orden } : t))
  })
  const [arrastrada, setArrastrada] = useState<string | null>(null)
  const [sobrePanel, setSobrePanel] = useState(false)
  const [proyectoSel, setProyectoSel] = useState(TODOS)

  const activo = sprints.find((s) => s.estado === "activo") ?? null
  const planificados = sprints.filter((s) => s.estado === "planificado")
  const [elegidoId, setElegidoId] = useState<string | null>(planificados[0]?.id ?? null)
  const elegido = planificados.find((s) => s.id === elegidoId) ?? planificados[0] ?? null
  const siguienteNumero = Math.max(0, ...sprints.map((s) => s.numero)) + 1

  const libres = vista
    .filter((t) => !t.sprint_id && t.estado === "backlog")
    .sort((a, b) => Number(a.orden) - Number(b.orden))
  const enSprint = elegido
    ? vista.filter((t) => t.sprint_id === elegido.id).sort((a, b) => Number(a.orden) - Number(b.orden))
    : []
  const enActivo = activo ? vista.filter((t) => t.sprint_id === activo.id) : []

  const nombreProyecto = new Map(proyectos.map((p) => [p.id, p.nombre]))
  const visibles = libres.filter((t) =>
    proyectoSel === TODOS
      ? true
      : proyectoSel === SIN_PROYECTO
        ? !t.proyecto_id
        : t.proyecto_id === proyectoSel
  )

  function cambiarSprint(tarea: Tarea, sprintId: string | null) {
    const estado: Tarea["estado"] = sprintId && activo?.id === sprintId ? "por_hacer" : "backlog"
    iniciarTransicion(async () => {
      aplicarOptimista({ id: tarea.id, sprint_id: sprintId, estado })
      try {
        await moverASprint(tarea.id, sprintId)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo mover la tarea")
      }
    })
  }

  // Sin sprint planificado, la tarea va directo al tablero (y al sprint
  // activo, si hay uno).
  function alTablero(tarea: Tarea) {
    iniciarTransicion(async () => {
      if (activo) aplicarOptimista({ id: tarea.id, sprint_id: activo.id, estado: "por_hacer" })
      else aplicarOptimista({ id: tarea.id, quitar: true })
      await pasarAlTablero(tarea.id)
    })
  }

  // Soltar sobre una fila de la lista: reordena el backlog (punto medio entre
  // las vecinas, una sola fila). Si venía del sprint, vuelve al backlog.
  function soltarEnLista(idSoltado: string, antesDe?: Tarea) {
    setArrastrada(null)
    const tarea = vista.find((t) => t.id === idSoltado)
    if (!tarea) return
    if (tarea.sprint_id) {
      cambiarSprint(tarea, null)
      return
    }
    const destino = libres.filter((t) => t.id !== idSoltado)
    const indice = antesDe ? destino.findIndex((t) => t.id === antesDe.id) : destino.length
    const orden = ordenEntre(destino[indice - 1], destino[indice])
    if (Number(tarea.orden) === orden) return
    iniciarTransicion(async () => {
      aplicarOptimista({ id: idSoltado, orden })
      await moverTarea(idSoltado, "backlog", orden)
    })
  }

  function idArrastrado(e: React.DragEvent): string | null {
    return e.dataTransfer.getData("text/plain") || arrastrada
  }

  // Tareas sin sprint por proyecto, para el selector.
  const conteos = new Map<string, number>()
  for (const t of libres) {
    const clave = t.proyecto_id ?? SIN_PROYECTO
    conteos.set(clave, (conteos.get(clave) ?? 0) + 1)
  }

  return (
    <div className="flex flex-wrap items-start gap-5">
      <section aria-label="Tareas sin sprint" className="flex min-w-0 flex-[999_1_420px] flex-col gap-3.5">
        <SelectorProyecto
          proyectos={proyectos}
          conteos={conteos}
          total={libres.length}
          valor={proyectoSel}
          onChange={setProyectoSel}
        />

        <ul
          className="m-0 flex list-none flex-col gap-2 p-0"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const id = idArrastrado(e)
            if (id) soltarEnLista(id)
          }}
        >
          {visibles.map((t) => (
            <li
              key={t.id}
              draggable={!esCelular}
              onDragStart={(e) => {
                setArrastrada(t.id)
                // Firefox no dispara el drop si el drag no lleva datos.
                e.dataTransfer.setData("text/plain", t.id)
                e.dataTransfer.effectAllowed = "move"
              }}
              onDragEnd={() => {
                setArrastrada(null)
                setSobrePanel(false)
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const id = idArrastrado(e)
                if (id && id !== t.id) soltarEnLista(id, t)
                else setArrastrada(null)
              }}
              className={cn(
                "group flex items-center gap-2.5 rounded-[10px] border bg-card py-1.5 pr-1.5 pl-3 hover:border-input",
                !esCelular && "cursor-grab active:cursor-grabbing",
                arrastrada === t.id && "opacity-40"
              )}
            >
              <GripVerticalIcon aria-hidden="true" className="size-4 shrink-0 text-input max-escritorio:hidden" />
              <div className="min-w-0 flex-1">
                <DetalleTarea
                  tarea={t}
                  sprints={sprints}
                  comentarios={comentarios.filter((c) => c.tarea_id === t.id)}
                  versiones={versiones.filter((v) => v.tarea_id === t.id)}
                  socios={socios}
                  clientes={clientes}
                  proyectos={proyectos}
                  abiertoInicial={t.numero === tareaAbierta}
                >
                  <span className="flex min-h-8 items-center gap-2.5" title={t.titulo}>
                    <span
                      aria-label={`Prioridad ${t.prioridad}`}
                      className={cn("size-2 shrink-0 rounded-full", COLOR_PRIORIDAD[t.prioridad])}
                    />
                    <span className="min-w-0 flex-1 truncate">{t.titulo}</span>
                    {proyectoSel === TODOS && t.proyecto_id && (
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                        {nombreProyecto.get(t.proyecto_id)}
                      </span>
                    )}
                    <span className="zq-num shrink-0 text-xs text-muted-foreground">
                      {codigoTarea(t.numero)}
                    </span>
                  </span>
                </DetalleTarea>
              </div>
              <button
                type="button"
                onClick={() => (elegido ? cambiarSprint(t, elegido.id) : alTablero(t))}
                className="h-8 shrink-0 rounded-lg bg-muted px-2.5 text-xs font-semibold opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-escritorio:opacity-100"
              >
                {elegido ? "Al sprint →" : "Al tablero →"}
              </button>
            </li>
          ))}
          {visibles.length === 0 && (
            <li className="rounded-xl border border-dashed border-input p-7 text-center text-muted-foreground">
              {libres.length === 0
                ? "No hay tareas sin sprint: todo está planificado."
                : "Todas las tareas de este proyecto ya están en un sprint."}
            </li>
          )}
        </ul>
      </section>

      <aside
        aria-label={elegido ? `${codigoSprint(elegido.numero)}, próximo sprint` : "Próximo sprint"}
        className="zq-sprint-panel"
        data-sobre={sobrePanel || undefined}
        onDragOver={(e) => {
          if (!elegido) return
          e.preventDefault()
          e.dataTransfer.dropEffect = "move"
        }}
        onDragEnter={(e) => {
          if (!elegido) return
          e.preventDefault()
          setSobrePanel(true)
        }}
        onDragLeave={(e) => {
          // Pasar de un hijo a otro dispara dragleave: solo vale salir del panel.
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
          setSobrePanel(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setSobrePanel(false)
          setArrastrada(null)
          const id = idArrastrado(e)
          const tarea = vista.find((t) => t.id === id)
          if (tarea && elegido && tarea.sprint_id !== elegido.id) cambiarSprint(tarea, elegido.id)
        }}
      >
        {activo && (
          <Link href="/tareas" className="zq-sprint-panel-tenue -mt-1 text-xs hover:text-crema">
            {codigoSprint(activo.numero)} en curso · {resumirSprint(enActivo).hechas}/{enActivo.length} · Ver tablero →
          </Link>
        )}

        {elegido ? (
          <>
            <div className="flex items-center gap-2.5">
              <p className="zq-sprint-panel-tenue m-0 text-xs font-bold tracking-[0.04em] uppercase">
                {codigoSprint(elegido.numero)}
              </p>
              <span className="zq-num min-w-[22px] rounded-full bg-lima px-[7px] text-center text-xs leading-[22px] font-bold text-carbon">
                {enSprint.length}
              </span>
              {planificados.length > 1 && (
                <select
                  aria-label="Sprint a planificar"
                  value={elegido.id}
                  onChange={(e) => setElegidoId(e.target.value)}
                  className="h-8 rounded-md border border-sidebar-border bg-transparent px-1.5 text-xs text-crema"
                >
                  {planificados.map((s) => (
                    <option key={s.id} value={s.id} className="text-foreground">
                      {codigoSprint(s.numero)}
                    </option>
                  ))}
                </select>
              )}
              <MenuSprint
                sprint={elegido}
                proyectos={proyectos}
                className="ml-auto text-crema hover:bg-sidebar-accent hover:text-crema"
              />
            </div>
            {nombreSinNumero(elegido) !== codigoSprint(elegido.numero) && (
              <p className="m-0 -mt-2 text-[13px] text-crema/80">{nombreSinNumero(elegido)}</p>
            )}

            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {enSprint.map((t) => (
                <li
                  key={t.id}
                  title={t.titulo}
                  draggable={!esCelular}
                  onDragStart={(e) => {
                    setArrastrada(t.id)
                    e.dataTransfer.setData("text/plain", t.id)
                    e.dataTransfer.effectAllowed = "move"
                  }}
                  onDragEnd={() => setArrastrada(null)}
                  className="flex items-center gap-2 rounded-lg bg-lima py-1 pr-1 pl-2.5 text-[13px] text-carbon"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      t.prioridad === "urgente" ? "bg-negativo" : t.prioridad === "alta" ? "bg-aviso" : "bg-carbon/35"
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{t.titulo}</span>
                  <button
                    type="button"
                    aria-label={`Sacar ${codigoTarea(t.numero)} del sprint`}
                    onClick={() => cambiarSprint(t, null)}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-carbon/60 hover:bg-carbon/10 hover:text-carbon"
                  >
                    <XIcon className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="zq-sprint-zona" aria-hidden="true">
              Arrastrá tareas acá
            </div>

            <div className="mt-auto flex flex-col gap-2.5">
              <span className="zq-sprint-panel-tenue text-xs">
                {activo
                  ? `Primero completá el ${codigoSprint(activo.numero)} para iniciar este`
                  : enSprint.length === 0
                    ? 'Arrastrá tareas o usá "Al sprint →"'
                    : `${enSprint.length} ${enSprint.length === 1 ? "tarea elegida" : "tareas elegidas"}`}
              </span>
              <IniciarSprint
                sprint={elegido}
                resumen={resumirSprint(enSprint)}
                bloqueo={
                  activo
                    ? `Hay un sprint activo (${codigoSprint(activo.numero)})`
                    : enSprint.length === 0
                      ? "El sprint está vacío"
                      : null
                }
                className="h-11 w-full bg-lima text-carbon hover:bg-lima/90"
              />
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-start gap-3">
            <p className="zq-sprint-panel-tenue m-0 text-xs font-bold tracking-[0.04em] uppercase">
              Próximo sprint
            </p>
            <p className="m-0 text-crema/80">
              No hay ningún sprint planificado. Creá el {codigoSprint(siguienteNumero)} y sumale tareas
              para iniciarlo.
            </p>
            <NuevoSprint
              proyectos={proyectos}
              siguienteNumero={siguienteNumero}
              className="mt-auto h-11 w-full border-0 bg-lima text-carbon hover:bg-lima/90"
            />
          </div>
        )}
      </aside>
    </div>
  )
}

// Selector de proyecto: botón grande con el proyecto elegido y un
// desplegable con buscador (por proyecto o cliente). Solo lista los
// proyectos con tareas pendientes, así escala a muchos proyectos.
function SelectorProyecto({
  proyectos,
  conteos,
  total,
  valor,
  onChange,
}: {
  proyectos: ProyectoOpcion[]
  conteos: Map<string, number>
  total: number
  valor: string
  onChange: (v: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [busca, setBusca] = useState("")

  const conTareas = proyectos
    .filter((p) => (conteos.get(p.id) ?? 0) > 0)
    .sort((a, b) => (conteos.get(b.id) ?? 0) - (conteos.get(a.id) ?? 0))
  const color = new Map(conTareas.map((p, i) => [p.id, COLORES_PROYECTO[i % COLORES_PROYECTO.length]]))

  type Opcion = { valor: string; nombre: string; cliente: string; n: number; cuadrado: string }
  const opciones: Opcion[] = [
    { valor: TODOS, nombre: "Todos los proyectos", cliente: "", n: total, cuadrado: "border border-dashed border-input" },
    ...conTareas.map((p) => ({
      valor: p.id,
      nombre: p.nombre,
      cliente: p.cliente_id ? p.cliente : "Interno",
      n: conteos.get(p.id) ?? 0,
      cuadrado: color.get(p.id) ?? "bg-muted",
    })),
    ...((conteos.get(SIN_PROYECTO) ?? 0) > 0
      ? [{ valor: SIN_PROYECTO, nombre: "Sin proyecto", cliente: "", n: conteos.get(SIN_PROYECTO) ?? 0, cuadrado: "bg-muted" }]
      : []),
  ]
  const q = busca.trim().toLowerCase()
  const filtradas = q ? opciones.filter((o) => `${o.nombre} ${o.cliente}`.toLowerCase().includes(q)) : opciones
  const actual = opciones.find((o) => o.valor === valor) ?? opciones[0]

  return (
    <Popover.Root
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v)
        if (!v) setBusca("")
      }}
    >
      <Popover.Trigger
        className="flex w-full items-center gap-2.5 rounded-xl border border-input bg-card px-3.5 py-3 text-left hover:bg-muted/40"
      >
        <span aria-hidden="true" className={cn("size-3 shrink-0 rounded-[4px]", actual.cuadrado)} />
        <strong className="truncate text-base font-semibold">{actual.nombre}</strong>
        <span className="shrink-0 text-xs text-muted-foreground">
          {actual.cliente && `${actual.cliente} · `}
          {actual.n} {actual.n === 1 ? "tarea" : "tareas"}
        </span>
        <ChevronDownIcon aria-hidden="true" className="ml-auto size-4 shrink-0 text-muted-foreground" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start" className="z-50">
          <Popover.Popup className="flex max-h-[min(420px,70dvh)] w-[min(360px,calc(100vw-32px))] flex-col gap-0.5 overflow-y-auto rounded-xl border bg-popover p-2 text-popover-foreground shadow-[var(--sombra-flotante)] outline-none">
            <Popover.Title className="sr-only">Elegir proyecto</Popover.Title>
            <label className="mb-1.5 flex items-center gap-2 rounded-lg border border-input px-2.5 focus-within:ring-2 focus-within:ring-ring">
              <SearchIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar proyecto o cliente…"
                aria-label="Buscar proyecto o cliente"
                className="h-9 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              />
            </label>
            {filtradas.map((o) => (
              <button
                key={o.valor}
                type="button"
                aria-pressed={o.valor === valor}
                onClick={() => {
                  onChange(o.valor)
                  setAbierto(false)
                  setBusca("")
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-muted",
                  o.valor === valor && "bg-muted font-semibold"
                )}
              >
                <span aria-hidden="true" className={cn("size-3 shrink-0 rounded-[4px]", o.cuadrado)} />
                <span className="min-w-0 flex-1 truncate">
                  {o.nombre}
                  {o.cliente && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{o.cliente}</span>}
                </span>
                <span className="zq-num text-xs text-muted-foreground">{o.n}</span>
              </button>
            ))}
            {filtradas.length === 0 && (
              <span className="px-2.5 py-2 text-xs text-muted-foreground">Ningún proyecto coincide</span>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

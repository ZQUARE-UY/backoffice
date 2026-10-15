"use client"

import { useOptimistic, useState, useTransition } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { useEsCelular } from "@/hooks/use-mobile"
import {
  codigoSprint,
  diasRestantesSprint,
  ESTADOS_TAREA,
  type ComentarioTarea,
  type EstadoTarea,
  type Socio,
  type Sprint,
  type Tarea,
  type VersionTarea,
} from "@/lib/dominio"
import { cn } from "@/lib/utils"

import { moverTarea } from "./actions"
import { type ClienteOpcion, type ProyectoOpcion } from "./campos-tarea"
import { DetalleTarea } from "./detalle-tarea"
import { ordenEntre } from "./orden"
import { CompletarSprint, type ResumenSprint } from "./sprints"
import { nombreSinNumero, PuntoColumna, TarjetaTarea } from "./tarjeta"

type Movimiento = { id: string; estado: EstadoTarea; orden: number }

// Columnas con tarjetas. Hecho va aparte, resumido en una tarjeta.
const COLUMNAS: EstadoTarea[] = ["por_hacer", "en_curso", "en_revision"]
const CORTO: Partial<Record<EstadoTarea, string>> = { en_revision: "Revisión" }

export function Tablero({
  tareas,
  comentarios,
  versiones,
  socios,
  clientes,
  proyectos,
  sprints,
  resumenActivo,
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
  // Avance del sprint activo contado en la base: el tablero solo trae las
  // hechas de los últimos días y contarlas acá daría de menos.
  resumenActivo: ResumenSprint | null
  hrefBacklog: string
  tareaAbierta?: number
}) {
  const esCelular = useEsCelular()
  const [, iniciarTransicion] = useTransition()
  const [vista, moverOptimista] = useOptimistic(
    tareas,
    (actual: Tarea[], mov: Movimiento) =>
      actual.map((t) => (t.id === mov.id ? { ...t, estado: mov.estado, orden: mov.orden } : t))
  )
  const [arrastrada, setArrastrada] = useState<string | null>(null)
  const [columnaActiva, setColumnaActiva] = useState<EstadoTarea | null>(null)
  // Un deep link a una tarjeta hecha abre la columna Hecho completa.
  const [verHechas, setVerHechas] = useState(() =>
    tareas.some((t) => t.estado === "hecho" && t.numero === tareaAbierta)
  )
  const [columnaMovil, setColumnaMovil] = useState<EstadoTarea>("por_hacer")

  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]))
  const nombreSocio = new Map(socios.map((s) => [s.id, s.nombre]))

  const activo = sprints.find((s) => s.estado === "activo") ?? null
  const planificados = sprints.filter((s) => s.estado === "planificado")

  function columna(estado: EstadoTarea) {
    return vista.filter((t) => t.estado === estado).sort((a, b) => Number(a.orden) - Number(b.orden))
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

  function propsZona(estado: EstadoTarea, items: Tarea[]) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
        setColumnaActiva(estado)
      },
      onDragLeave: () => setColumnaActiva((c) => (c === estado ? null : c)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault()
        // Soltar en el fondo de la columna: la tarjeta va al final.
        const id = e.dataTransfer.getData("text/plain") || arrastrada
        if (!id) return
        soltar(estado, items.filter((t) => t.id !== id).length, id)
      },
    }
  }

  function tarjeta(tarea: Tarea, estado: EstadoTarea, items: Tarea[]) {
    return (
      <div
        key={tarea.id}
        draggable={!esCelular}
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
          soltar(estado, destino.findIndex((t) => t.id === tarea.id), id)
        }}
        className={cn(!esCelular && "cursor-grab active:cursor-grabbing", arrastrada === tarea.id && "opacity-40")}
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
          <TarjetaTarea
            tarea={tarea}
            cliente={tarea.cliente_id ? nombreCliente.get(tarea.cliente_id) : null}
            responsable={tarea.asignado_a ? nombreSocio.get(tarea.asignado_a) : null}
          />
        </DetalleTarea>
      </div>
    )
  }

  function encabezadoColumna(estado: EstadoTarea, n: number) {
    return (
      <div className="flex items-center justify-between gap-2 px-1.5 pt-1 pb-2">
        <h2 className="m-0 inline-flex items-center gap-2 text-sm font-semibold">
          <PuntoColumna estado={estado} />
          {ESTADOS_TAREA[estado].label}
        </h2>
        <span className="zq-num min-w-[22px] rounded-full bg-card px-[7px] text-center text-xs leading-[22px] font-semibold">
          {n}
        </span>
      </div>
    )
  }

  const hechas = columna("hecho")

  return (
    <div className="flex flex-col gap-5">
      <BarraSprint
        activo={activo}
        resumen={resumenActivo}
        planificados={planificados}
        hrefBacklog={hrefBacklog}
      />

      {esCelular ? (
        // Celular: una columna por vez, con un selector segmentado.
        <div className="flex flex-col gap-2.5">
          <div role="tablist" aria-label="Columna" className="flex rounded-xl bg-muted p-[3px]">
            {COLUMNAS.map((estado) => {
              const on = estado === columnaMovil
              return (
                <button
                  key={estado}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setColumnaMovil(estado)}
                  className={cn(
                    "min-h-11 flex-1 rounded-[10px] text-[13px]",
                    on ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {CORTO[estado] ?? ESTADOS_TAREA[estado].label}{" "}
                  <strong className="zq-num">{columna(estado).length}</strong>
                </button>
              )
            })}
          </div>
          {columna(columnaMovil).map((t) => tarjeta(t, columnaMovil, columna(columnaMovil)))}
          {columna(columnaMovil).length === 0 && (
            <p className="m-0 rounded-[14px] border border-dashed border-input p-6 text-center text-muted-foreground">
              Nada en esta columna
            </p>
          )}
          {hechas.length > 0 && (
            <p className="m-0 pt-1 text-center text-xs text-muted-foreground">
              {hechas.length} {hechas.length === 1 ? "tarjeta hecha" : "tarjetas hechas"} en los últimos días
            </p>
          )}
        </div>
      ) : (
        <div
          className={cn(
            "grid items-start gap-3 overflow-x-auto pb-1",
            verHechas
              ? "grid-cols-[repeat(4,minmax(220px,1fr))]"
              : "grid-cols-[repeat(3,minmax(240px,1fr))_180px]"
          )}
        >
          {COLUMNAS.map((estado) => {
            const items = columna(estado)
            return (
              <section
                key={estado}
                aria-label={ESTADOS_TAREA[estado].label}
                {...propsZona(estado, items)}
                className={cn(
                  "flex min-h-[520px] flex-col gap-2 rounded-xl bg-muted p-2.5 transition-shadow",
                  columnaActiva === estado && arrastrada && "ring-2 ring-ring"
                )}
              >
                {encabezadoColumna(estado, items.length)}
                {items.map((t) => tarjeta(t, estado, items))}
                {items.length === 0 && (
                  <div className="rounded-[10px] border border-dashed border-input px-3 py-5 text-center text-muted-foreground">
                    Arrastrá una tarjeta acá
                  </div>
                )}
              </section>
            )
          })}

          <section
            aria-label="Hecho"
            {...propsZona("hecho", hechas)}
            className={cn(
              "flex min-h-[520px] flex-col gap-2 rounded-xl bg-muted p-2.5 transition-shadow",
              columnaActiva === "hecho" && arrastrada && "ring-2 ring-ring"
            )}
          >
            {encabezadoColumna("hecho", hechas.length)}
            {verHechas ? (
              <>
                {hechas.map((t) => tarjeta(t, "hecho", hechas))}
                <Button variant="ghost" size="sm" onClick={() => setVerHechas(false)}>
                  Resumir
                </Button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setVerHechas(true)}
                className="flex flex-col gap-1 rounded-[10px] border bg-card px-3.5 py-4 text-left hover:border-input"
              >
                <span className="zq-num font-display text-[28px] leading-8">{hechas.length}</span>
                <span className="text-muted-foreground">
                  {hechas.length === 1 ? "tarjeta hecha" : "tarjetas hechas"}
                </span>
                {hechas.length > 0 && <span className="mt-1 font-semibold">Ver →</span>}
              </button>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

// Barra del sprint activo: badge con el número, nombre, mini barra de avance
// y cuánto le queda (en negativo si venció). Sin sprint activo, invita a
// planificar uno.
function BarraSprint({
  activo,
  resumen,
  planificados,
  hrefBacklog,
}: {
  activo: Sprint | null
  resumen: ResumenSprint | null
  planificados: Sprint[]
  hrefBacklog: string
}) {
  if (!activo) {
    return (
      <section
        aria-label="Sprint"
        className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-input px-4 py-3 text-muted-foreground"
      >
        <span>
          {planificados.length > 0
            ? `Sin sprint activo. ${codigoSprint(planificados[0].numero)} está planificado.`
            : "Sin sprint activo: el tablero es un flujo continuo."}
        </span>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={hrefBacklog} />}
          className="ml-auto"
        >
          {planificados.length > 0 ? "Ir a iniciarlo →" : "Planificar un sprint →"}
        </Button>
      </section>
    )
  }

  const r = resumen ?? { total: 0, hechas: 0, puntos: 0, puntos_hechos: 0 }
  const pct = r.total > 0 ? Math.round((r.hechas / r.total) * 100) : 0
  const dias = diasRestantesSprint(activo)

  return (
    <section
      aria-label="Sprint activo"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border bg-card px-4 py-3"
    >
      <span className="rounded-full bg-lima px-2.5 text-xs leading-[22px] font-semibold text-carbon">
        {codigoSprint(activo.numero)}
      </span>
      <span className="font-semibold max-escritorio:hidden">{nombreSinNumero(activo)}</span>
      <span className="zq-num inline-flex items-center gap-2 text-muted-foreground">
        <span
          role="img"
          aria-label={`${r.hechas} de ${r.total} hechas`}
          className="inline-block h-1.5 w-20 overflow-hidden rounded-full bg-muted"
        >
          <span className="block h-full bg-foreground" style={{ width: `${pct}%` }} />
        </span>
        {r.hechas}/{r.total}
      </span>
      {dias !== null && (
        <span
          className={cn(
            "text-[13px] font-semibold",
            dias < 0 ? "text-negativo" : dias <= 2 ? "text-aviso" : "text-muted-foreground"
          )}
        >
          {dias < -1 && `Venció hace ${-dias} días`}
          {dias === -1 && "Venció ayer"}
          {dias === 0 && "Termina hoy"}
          {dias === 1 && "Termina mañana"}
          {dias > 1 && `Quedan ${dias} días`}
        </span>
      )}
      <span className="ml-auto">
        <CompletarSprint
          sprint={activo}
          resumen={r}
          sprintsPlanificados={planificados}
          variante="ghost"
        />
      </span>
    </section>
  )
}

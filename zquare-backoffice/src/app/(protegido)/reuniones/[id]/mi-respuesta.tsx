"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { diasDeVentana, sumarDias } from "@/lib/disponibilidad"
import { cn } from "@/lib/utils"

import { borrarRespuesta, guardarRespuesta, marcarNoPuedo } from "../actions"

type Rango = { desde: string; hasta: string }

// El día se pinta en bloques de media hora, de 08:00 a 20:00. Media hora
// porque es la unidad de los huecos que después se proponen: así lo que se
// marca es exactamente lo que se ofrece.
const HORA_INICIO = 8
const HORA_FIN = 20
const BLOQUES_POR_HORA = 2
const CANT_BLOQUES = (HORA_FIN - HORA_INICIO) * BLOQUES_POR_HORA

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

// Lunes = 0 … Domingo = 6, sin depender de la zona del navegador.
function diaDeSemana(fecha: string): number {
  return (new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7
}

function etiquetaLarga(fecha: string): string {
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}

function etiquetaMes(fecha: string): string {
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-UY", {
    month: "short",
  })
}

// Semanas completas (lunes a domingo) que cubren la ventana. Los días fuera
// de la ventana quedan en la grilla pero apagados, para que la semana se lea
// entera.
function semanasDe(dias: string[]): string[][] {
  if (dias.length === 0) return []
  const primero = sumarDias(dias[0], -diaDeSemana(dias[0]))
  const ultimo = sumarDias(
    dias[dias.length - 1],
    6 - diaDeSemana(dias[dias.length - 1])
  )
  const todos = diasDeVentana(primero, ultimo)
  const semanas: string[][] = []
  for (let i = 0; i < todos.length; i += 7) {
    semanas.push(todos.slice(i, i + 7))
  }
  return semanas
}

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
}

// ── Bloques ↔ rangos ──────────────────────────────────────────────────────

function minutosDe(hora: string): number {
  const [h, m] = hora.split(":").map(Number)
  return h * 60 + m
}

function horaDe(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function inicioBloque(indice: number): number {
  return HORA_INICIO * 60 + indice * (60 / BLOQUES_POR_HORA)
}

// Un bloque está pintado si cae entero dentro de algún rango guardado.
function bloquesDe(rangos: Rango[]): boolean[] {
  const bloques = Array<boolean>(CANT_BLOQUES).fill(false)
  for (const r of rangos) {
    if (!r.desde || !r.hasta) continue
    const desde = minutosDe(r.desde)
    const hasta = minutosDe(r.hasta === "23:59" ? "24:00" : r.hasta)
    for (let i = 0; i < CANT_BLOQUES; i++) {
      const ini = inicioBloque(i)
      const fin = ini + 60 / BLOQUES_POR_HORA
      if (ini >= desde && fin <= hasta) bloques[i] = true
    }
  }
  return bloques
}

// Bloques consecutivos pintados → un rango.
function rangosDe(bloques: boolean[]): Rango[] {
  const rangos: Rango[] = []
  let abierto: number | null = null
  for (let i = 0; i <= CANT_BLOQUES; i++) {
    const pintado = i < CANT_BLOQUES && bloques[i]
    if (pintado && abierto === null) abierto = i
    if (!pintado && abierto !== null) {
      rangos.push({
        desde: horaDe(inicioBloque(abierto)),
        hasta: horaDe(inicioBloque(i)),
      })
      abierto = null
    }
  }
  return rangos
}

// "9–13 · 14:30–18"
function resumenRangos(rangos: Rango[]): string {
  const corta = (h: string) => (h.endsWith(":00") ? h.slice(0, 2).replace(/^0/, "") : h.replace(/^0/, ""))
  return rangos.map((r) => `${corta(r.desde)}–${corta(r.hasta)}`).join(" · ")
}

// ── Editor de un día: bloques que se pintan tocando o arrastrando ─────────

function PintorDeDia({
  bloques,
  onCambiar,
}: {
  bloques: boolean[]
  onCambiar: (bloques: boolean[]) => void
}) {
  // Mientras se arrastra, se pinta o despinta según cómo estaba el primer
  // bloque tocado; así un mismo trazo no alterna.
  const trazo = useRef<{ pintar: boolean; ultimo: number } | null>(null)
  const contenedor = useRef<HTMLDivElement>(null)

  // Pinta el tramo [desde, hasta] entero: si el puntero se movió rápido y se
  // salteó bloques, igual quedan pintados.
  function aplicar(desde: number, hasta: number, pintar: boolean) {
    const a = Math.min(desde, hasta)
    const b = Math.max(desde, hasta)
    onCambiar(bloques.map((v, i) => (i >= a && i <= b ? pintar : v)))
  }

  function bloqueEn(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y)
    const attr = el?.closest<HTMLElement>("[data-bloque]")?.dataset.bloque
    return attr === undefined ? null : Number(attr)
  }

  function empezar(e: React.PointerEvent, indice: number) {
    e.preventDefault()
    const pintar = !bloques[indice]
    trazo.current = { pintar, ultimo: indice }
    aplicar(indice, indice, pintar)
  }

  function mover(e: React.PointerEvent) {
    if (!trazo.current) return
    const indice = bloqueEn(e.clientX, e.clientY)
    if (indice === null || indice === trazo.current.ultimo) return
    aplicar(trazo.current.ultimo, indice, trazo.current.pintar)
    trazo.current.ultimo = indice
  }

  useEffect(() => {
    const soltar = () => {
      trazo.current = null
    }
    window.addEventListener("pointerup", soltar)
    window.addEventListener("pointercancel", soltar)
    return () => {
      window.removeEventListener("pointerup", soltar)
      window.removeEventListener("pointercancel", soltar)
    }
  }, [])

  const horas = Array.from(
    { length: HORA_FIN - HORA_INICIO },
    (_, i) => HORA_INICIO + i
  )

  return (
    <div className="flex flex-col gap-1 select-none">
      <div
        ref={contenedor}
        onPointerMove={mover}
        className="grid touch-none gap-px overflow-hidden rounded-lg border bg-border"
        style={{ gridTemplateColumns: `repeat(${CANT_BLOQUES}, minmax(0, 1fr))` }}
      >
        {bloques.map((pintado, i) => (
          <div
            key={i}
            data-bloque={i}
            role="checkbox"
            aria-checked={pintado}
            aria-label={`${horaDe(inicioBloque(i))} a ${horaDe(inicioBloque(i + 1))}`}
            tabIndex={0}
            onPointerDown={(e) => empezar(e, i)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault()
                aplicar(i, i, !pintado)
              }
            }}
            className={cn(
              "h-12 cursor-pointer transition-colors",
              pintado ? "bg-primary" : "bg-background hover:bg-muted",
              // Línea más marcada al cambiar de hora, para leer la escala.
              i % BLOQUES_POR_HORA === 0 && i > 0 && "border-l border-border/60"
            )}
          />
        ))}
      </div>
      <div
        className="grid text-[10px] tabular-nums text-muted-foreground"
        style={{ gridTemplateColumns: `repeat(${horas.length}, minmax(0, 1fr))` }}
      >
        {horas.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
    </div>
  )
}

// ── Componente ────────────────────────────────────────────────────────────

// Cada socio pinta acá los ratos en que le sirve reunirse, sobre una grilla
// semanal: se elige un día y se pintan sus bloques de hora. No es su agenda:
// lo que ya tiene ocupado en Google Calendar se descuenta solo, así que lo que
// se marca es la disposición ("de tarde sí, de mañana no"). En cada día se ve
// además quién más ya dijo que puede.
export function MiRespuesta({
  solicitudId,
  ventanaDesde,
  ventanaHasta,
  inicial,
  puedenPorDia,
  yaRespondi,
  noPuedo,
}: {
  solicitudId: string
  ventanaDesde: string
  ventanaHasta: string
  // Franjas ya guardadas, como hora de pared por día.
  inicial: Record<string, Rango[]>
  // Nombres de los otros socios que marcaron algo cada día.
  puedenPorDia: Record<string, string[]>
  yaRespondi: boolean
  noPuedo: boolean
}) {
  const dias = diasDeVentana(ventanaDesde, ventanaHasta)
  const enVentana = new Set(dias)
  const semanas = semanasDe(dias)

  const [porDia, setPorDia] = useState<Record<string, boolean[]>>(() =>
    Object.fromEntries(dias.map((d) => [d, bloquesDe(inicial[d] ?? [])]))
  )
  const [activo, setActivo] = useState<string | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  const rangosPorDia = Object.fromEntries(
    dias.map((d) => [d, rangosDe(porDia[d] ?? [])])
  ) as Record<string, Rango[]>

  const franjas = dias.flatMap((fecha) =>
    rangosPorDia[fecha].map((r) => ({ fecha, desde: r.desde, hasta: r.hasta }))
  )

  function ejecutar(
    accion: () => Promise<{ ok: boolean; error?: string }>,
    exito: string
  ) {
    iniciarTransicion(async () => {
      const resultado = await accion()
      if (resultado.ok) toast.success(exito)
      else toast.error(resultado.error ?? "No se pudo guardar")
    })
  }

  function vaciar() {
    setPorDia(Object.fromEntries(dias.map((d) => [d, bloquesDe([])])))
    setActivo(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {yaRespondi ? "Tu disponibilidad" : "¿Cuándo podés?"}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {noPuedo
            ? "Dijiste que no podés en estos días. Si te liberaste, pintá las horas."
            : "Elegí un día y pintá las horas en que podés."}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">

        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="grid grid-cols-7 gap-1 pb-1">
              {DIAS_SEMANA.map((d) => (
                <div
                  key={d}
                  className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {d}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              {semanas.map((semana) => (
                <div key={semana[0]} className="grid grid-cols-7 gap-1">
                  {semana.map((fecha) => {
                    const dentro = enVentana.has(fecha)
                    const bloques = porDia[fecha] ?? []
                    const rangos = rangosPorDia[fecha] ?? []
                    const marcado = rangos.length > 0
                    const otros = puedenPorDia[fecha] ?? []
                    const esActivo = activo === fecha
                    const dia = Number(fecha.slice(8, 10))
                    const primeroDeMes = dia === 1 || fecha === dias[0]

                    return (
                      <button
                        key={fecha}
                        type="button"
                        disabled={!dentro}
                        onClick={() => dentro && setActivo(fecha)}
                        aria-pressed={esActivo}
                        aria-label={etiquetaLarga(fecha)}
                        className={cn(
                          "flex min-h-24 flex-col items-start gap-1.5 rounded-lg border p-2 text-left text-sm transition-colors",
                          "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                          !dentro &&
                            "cursor-default border-transparent bg-transparent text-muted-foreground/40",
                          dentro && !marcado && "border-border hover:bg-muted/60",
                          marcado &&
                            "border-primary/40 bg-primary/5 hover:bg-primary/10",
                          esActivo && "ring-2 ring-primary"
                        )}
                      >
                        <span className="flex w-full items-baseline justify-between">
                          <span
                            className={cn(
                              "font-medium tabular-nums",
                              marcado && "text-primary"
                            )}
                          >
                            {dia}
                          </span>
                          {primeroDeMes && dentro && (
                            <span className="text-[10px] uppercase text-muted-foreground">
                              {etiquetaMes(fecha)}
                            </span>
                          )}
                        </span>

                        {dentro && (
                          <span
                            aria-hidden
                            className="grid h-1.5 w-full gap-px"
                            style={{
                              gridTemplateColumns: `repeat(${CANT_BLOQUES}, minmax(0, 1fr))`,
                            }}
                          >
                            {bloques.map((b, i) => (
                              <span
                                key={i}
                                className={cn(
                                  "rounded-[1px]",
                                  b ? "bg-primary" : "bg-muted"
                                )}
                              />
                            ))}
                          </span>
                        )}

                        {dentro && marcado && (
                          <span className="text-xs leading-tight text-primary tabular-nums">
                            {resumenRangos(rangos)}
                          </span>
                        )}

                        {dentro && otros.length > 0 && (
                          <span
                            className="mt-auto flex flex-wrap gap-0.5"
                            title={`Pueden: ${otros.join(", ")}`}
                          >
                            {otros.map((nombre) => (
                              <span
                                key={nombre}
                                className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground"
                              >
                                {iniciales(nombre)}
                              </span>
                            ))}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {activo && (
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium capitalize">
                {etiquetaLarga(activo)}
              </span>
              {rangosPorDia[activo].length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {resumenRangos(rangosPorDia[activo])}
                </span>
              )}
            </div>

            <PintorDeDia
              bloques={porDia[activo]}
              onCambiar={(bloques) =>
                setPorDia((previo) => ({ ...previo, [activo]: bloques }))
              }
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {yaRespondi && (
            <Button
              type="button"
              variant="ghost"
              disabled={pendiente}
              onClick={() => {
                vaciar()
                ejecutar(
                  () => borrarRespuesta(solicitudId),
                  "Borramos tu respuesta"
                )
              }}
            >
              Borrar mi respuesta
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            disabled={pendiente}
            onClick={() => {
              vaciar()
              ejecutar(
                () => marcarNoPuedo(solicitudId),
                "Avisamos que no podés en estos días"
              )
            }}
          >
            No puedo ninguno de estos días
          </Button>

          <Button
            type="button"
            // Sin franjas no hay nada que guardar: para eso está el botón de
            // "no puedo", que es explícito.
            disabled={pendiente || franjas.length === 0}
            onClick={() =>
              ejecutar(
                () => guardarRespuesta(solicitudId, franjas),
                "Guardamos tu disponibilidad"
              )
            }
          >
            {pendiente && <Spinner data-icon="inline-start" />}
            Guardar mi disponibilidad
          </Button>

        </div>
      </CardContent>
    </Card>
  )
}

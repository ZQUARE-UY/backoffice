"use client"

import { useState, useTransition } from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { diasDeVentana, sumarDias } from "@/lib/disponibilidad"
import { cn } from "@/lib/utils"

import { borrarRespuesta, guardarRespuesta, marcarNoPuedo } from "../actions"

type Rango = { desde: string; hasta: string }

// Atajos: la mayoría de las respuestas caen en uno de estos bloques.
const PRESETS: { label: string; rango: Rango }[] = [
  { label: "Mañana", rango: { desde: "09:00", hasta: "13:00" } },
  { label: "Tarde", rango: { desde: "14:00", hasta: "18:00" } },
  { label: "Todo el día", rango: { desde: "09:00", hasta: "18:00" } },
]

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

function resumenRango(rango: Rango): string {
  const preset = PRESETS.find(
    (p) => p.rango.desde === rango.desde && p.rango.hasta === rango.hasta
  )
  return preset ? preset.label : `${rango.desde}–${rango.hasta}`
}

// Cada socio pinta acá los ratos en que le sirve reunirse, sobre una grilla
// semanal. No es su agenda: lo que ya tiene ocupado en Google Calendar se
// descuenta solo, así que lo que se marca es la disposición ("de tarde sí,
// de mañana no"). En cada día se ve además quién más ya dijo que puede.
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

  const [porDia, setPorDia] = useState<Record<string, Rango[]>>(inicial)
  const [activo, setActivo] = useState<string | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  function agregar(fecha: string, rango: Rango) {
    setPorDia((previo) => ({
      ...previo,
      [fecha]: [...(previo[fecha] ?? []), rango],
    }))
  }

  function quitar(fecha: string, indice: number) {
    setPorDia((previo) => ({
      ...previo,
      [fecha]: (previo[fecha] ?? []).filter((_, i) => i !== indice),
    }))
  }

  function limpiar(fecha: string) {
    setPorDia((previo) => ({ ...previo, [fecha]: [] }))
  }

  function editar(
    fecha: string,
    indice: number,
    campo: keyof Rango,
    valor: string
  ) {
    setPorDia((previo) => ({
      ...previo,
      [fecha]: (previo[fecha] ?? []).map((r, i) =>
        i === indice ? { ...r, [campo]: valor } : r
      ),
    }))
  }

  // Un click sobre un día vacío lo marca "todo el día" y lo deja activo para
  // afinar; sobre uno ya marcado, solo lo activa. Así el caso común (marcar
  // varios días enteros) es un click por día.
  function tocarDia(fecha: string) {
    if (!enVentana.has(fecha)) return
    if ((porDia[fecha] ?? []).length === 0) {
      agregar(fecha, PRESETS[2].rango)
    }
    setActivo(fecha)
  }

  // Alterna un preset en el día activo: si ya está, lo saca. "Todo el día"
  // y los medios días se excluyen entre sí: elegir uno reemplaza al otro,
  // porque acumularlos no agrega nada.
  function alternarPreset(fecha: string, rango: Rango) {
    const rangos = porDia[fecha] ?? []
    const igual = (r: Rango) =>
      r.desde === rango.desde && r.hasta === rango.hasta
    if (rangos.some(igual)) {
      setPorDia((previo) => ({
        ...previo,
        [fecha]: (previo[fecha] ?? []).filter((r) => !igual(r)),
      }))
      return
    }
    const todoElDia = PRESETS[2].rango
    const esTodoElDia = igual(todoElDia)
    setPorDia((previo) => ({
      ...previo,
      [fecha]: [
        ...(previo[fecha] ?? []).filter((r) =>
          esTodoElDia
            ? false
            : !(r.desde === todoElDia.desde && r.hasta === todoElDia.hasta)
        ),
        rango,
      ],
    }))
  }

  function copiarDiaAnterior(fecha: string) {
    const indice = dias.indexOf(fecha)
    const anterior = dias[indice - 1]
    if (!anterior) return
    setPorDia((previo) => ({
      ...previo,
      [fecha]: [...(previo[anterior] ?? [])],
    }))
  }

  const franjas = dias.flatMap((fecha) =>
    (porDia[fecha] ?? [])
      .filter((r) => r.desde && r.hasta)
      .map((r) => ({ fecha, desde: r.desde, hasta: r.hasta }))
  )
  const invalidas = franjas.filter((f) => f.hasta <= f.desde)
  const diasMarcados = dias.filter((d) => (porDia[d] ?? []).length > 0).length

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

  const rangosActivo = activo ? (porDia[activo] ?? []) : []

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {yaRespondi ? "Tu disponibilidad" : "¿Cuándo podés?"}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Tocá los días en que te sirve reunirte; después podés afinar la hora.
          Lo que ya tenés ocupado en tu Google Calendar se descuenta solo.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {noPuedo && (
          <p className="text-sm text-muted-foreground">
            Respondiste que no podés en ninguno de estos días. Podés marcar
            días igual si te liberaste.
          </p>
        )}

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
                    const rangos = porDia[fecha] ?? []
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
                        onClick={() => tocarDia(fecha)}
                        aria-pressed={marcado}
                        aria-label={etiquetaLarga(fecha)}
                        className={cn(
                          "flex min-h-24 flex-col items-start gap-1 rounded-lg border p-2 text-left text-sm transition-colors",
                          "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                          !dentro &&
                            "cursor-default border-transparent bg-transparent text-muted-foreground/40",
                          dentro &&
                            !marcado &&
                            "border-border hover:bg-muted/60",
                          marcado &&
                            "border-primary/40 bg-primary/10 hover:bg-primary/15",
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

                        {dentro && marcado && (
                          <span className="flex flex-col gap-0.5 text-xs leading-tight text-primary">
                            {rangos.slice(0, 3).map((r, i) => (
                              <span key={i}>{resumenRango(r)}</span>
                            ))}
                            {rangos.length > 3 && (
                              <span>+{rangos.length - 3} más</span>
                            )}
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium capitalize">
                {etiquetaLarga(activo)}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {PRESETS.map((preset) => {
                  const puesto = rangosActivo.some(
                    (r) =>
                      r.desde === preset.rango.desde &&
                      r.hasta === preset.rango.hasta
                  )
                  return (
                    <Button
                      key={preset.label}
                      type="button"
                      variant={puesto ? "default" : "outline"}
                      size="sm"
                      onClick={() => alternarPreset(activo, preset.rango)}
                    >
                      {preset.label}
                    </Button>
                  )
                })}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    agregar(activo, { desde: "09:00", hasta: "18:00" })
                  }
                >
                  <PlusIcon data-icon="inline-start" />
                  Otro rango
                </Button>
                {dias.indexOf(activo) > 0 &&
                  (porDia[dias[dias.indexOf(activo) - 1]] ?? []).length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => copiarDiaAnterior(activo)}
                    >
                      Copiar día anterior
                    </Button>
                  )}
                {rangosActivo.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => limpiar(activo)}
                  >
                    Ese día no
                  </Button>
                )}
              </div>
            </div>

            {rangosActivo.length > 0 && (
              <div className="flex flex-col gap-2">
                {rangosActivo.map((rango, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="time"
                      step="900"
                      value={rango.desde}
                      onChange={(e) => editar(activo, i, "desde", e.target.value)}
                      className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                    />
                    <span className="text-sm text-muted-foreground">a</span>
                    <input
                      type="time"
                      step="900"
                      value={rango.hasta}
                      onChange={(e) => editar(activo, i, "hasta", e.target.value)}
                      className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                    />
                    {rango.hasta <= rango.desde && (
                      <span className="text-xs text-destructive">
                        termina antes de empezar
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => quitar(activo, i)}
                      aria-label="Quitar franja"
                    >
                      <XIcon />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {(puedenPorDia[activo] ?? []).length > 0 && (
              <p className="text-xs text-muted-foreground">
                Ese día también pueden: {(puedenPorDia[activo] ?? []).join(", ")}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            // Sin franjas no hay nada que guardar: para eso está el botón de
            // "no puedo", que es explícito.
            disabled={pendiente || invalidas.length > 0 || franjas.length === 0}
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

          <Button
            type="button"
            variant="outline"
            disabled={pendiente}
            onClick={() => {
              setPorDia({})
              setActivo(null)
              ejecutar(
                () => marcarNoPuedo(solicitudId),
                "Avisamos que no podés en estos días"
              )
            }}
          >
            No puedo ninguno de estos días
          </Button>

          {yaRespondi && (
            <Button
              type="button"
              variant="ghost"
              disabled={pendiente}
              onClick={() => {
                setPorDia({})
                setActivo(null)
                ejecutar(
                  () => borrarRespuesta(solicitudId),
                  "Borramos tu respuesta"
                )
              }}
            >
              Borrar mi respuesta
            </Button>
          )}

          {diasMarcados > 0 && (
            <span className="text-sm text-muted-foreground">
              {diasMarcados} {diasMarcados === 1 ? "día marcado" : "días marcados"}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

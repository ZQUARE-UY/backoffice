"use client"

import { useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { sumarDias } from "@/lib/disponibilidad"
import { cn } from "@/lib/utils"

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre"]
const DIAS_CORTOS = ["dom.", "lun.", "mar.", "mié.", "jue.", "vie.", "sáb."]
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

function diaDeSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay() // 0 = domingo
}

function primeroDelMes(mes: string): string {
  return `${mes}-01`
}

function mesVecino(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number)
  const d = new Date(Date.UTC(a, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export function etiquetaCorta(fecha: string): string {
  const [, m, d] = fecha.split("-").map(Number)
  return `${DIAS_CORTOS[diaDeSemana(fecha)]} ${d} ${MESES[m - 1].slice(0, 3).toLowerCase()}.`
}

export function diasHabiles(desde: string, hasta: string): number {
  let n = 0
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const d = diaDeSemana(f)
    if (d !== 0 && d !== 6) n++
  }
  return n
}

// Calendario de mes para elegir un rango de días: el primer clic marca el
// inicio y el segundo el fin. El rango se pinta en lima con los extremos en
// tinta; los días pasados quedan deshabilitados y los fines de semana tenues.
export function CalendarioRango({
  hoy,
  desde,
  hasta,
  onChange,
}: {
  hoy: string
  desde: string | null
  hasta: string | null
  onChange: (desde: string | null, hasta: string | null) => void
}) {
  const [mes, setMes] = useState((desde ?? hoy).slice(0, 7))
  const [anio, numMes] = mes.split("-").map(Number)
  const primero = primeroDelMes(mes)
  // Lunes primero: cuántos huecos antes del día 1.
  const hueco = (diaDeSemana(primero) + 6) % 7
  const diasMes = new Date(Date.UTC(anio, numMes, 0)).getUTCDate()
  const fechas = Array.from({ length: diasMes }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`)
  const fin = hasta ?? desde

  function elegir(f: string) {
    if (!desde || hasta) onChange(f, null)
    else if (f < desde) onChange(f, null)
    else onChange(desde, f)
  }

  return (
    <div className="rounded-xl border bg-card px-2.5 pt-2.5 pb-2">
      <div className="mb-1.5 flex items-center justify-between">
        <button
          type="button"
          aria-label="Mes anterior"
          onClick={() => setMes((m) => mesVecino(m, -1))}
          disabled={mes <= hoy.slice(0, 7)}
          className="flex size-8 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <strong className="text-sm font-semibold">
          {MESES[numMes - 1]} {anio}
        </strong>
        <button
          type="button"
          aria-label="Mes siguiente"
          onClick={() => setMes((m) => mesVecino(m, 1))}
          className="flex size-8 items-center justify-center rounded-lg hover:bg-muted"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-[3px]" role="grid" aria-label="Días candidatos">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
          <span key={i} aria-hidden="true" className="pb-1 text-center text-xs text-muted-foreground">
            {d}
          </span>
        ))}
        {Array.from({ length: hueco }, (_, i) => (
          <span key={`h${i}`} aria-hidden="true" />
        ))}
        {fechas.map((f) => {
          const pasado = f < hoy
          const dia = diaDeSemana(f)
          const finde = dia === 0 || dia === 6
          const enRango = Boolean(desde && fin && f >= desde && f <= fin)
          const esIni = f === desde
          const esFin = f === fin
          const extremo = esIni || esFin
          return (
            <button
              key={f}
              type="button"
              disabled={pasado}
              aria-pressed={enRango}
              aria-label={`${DIAS_LARGOS[dia]} ${Number(f.slice(8))} de ${MESES[numMes - 1].toLowerCase()}`}
              onClick={() => elegir(f)}
              className={cn(
                "zq-num h-8 text-[13px]",
                pasado
                  ? "cursor-default text-input"
                  : extremo
                    ? "bg-foreground font-bold text-background"
                    : enRango
                      ? "bg-lima/50 text-carbon"
                      : finde
                        ? "text-muted-foreground hover:bg-muted"
                        : "hover:bg-muted",
                extremo && esIni && esFin
                  ? "rounded-full"
                  : esIni
                    ? "rounded-l-full"
                    : esFin
                      ? "rounded-r-full"
                      : enRango
                        ? "rounded-none"
                        : "rounded-full",
                f === hoy && !extremo && "ring-[1.5px] ring-foreground ring-inset"
              )}
            >
              {Number(f.slice(8))}
            </button>
          )
        })}
      </div>
    </div>
  )
}

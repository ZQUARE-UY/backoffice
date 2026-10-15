"use client"

import { useOptimistic, useTransition } from "react"
import { CircleHelpIcon, ThumbsDownIcon, ThumbsUpIcon, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import {
  VALORES_VOTO,
  VALORES_VOTO_ORDEN,
  type Socio,
  type ValorVoto,
  type VotoIdea,
} from "@/lib/dominio"
import { iniciales } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { votarIdea } from "./actions"

const ICONO: Record<ValorVoto, LucideIcon> = {
  si: ThumbsUpIcon,
  dudas: CircleHelpIcon,
  no: ThumbsDownIcon,
}

// "Y" entre los dos últimos: "Francisco, vos y Nicolás".
function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join("")
  return `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`
}

// "¿La hacemos?": tres botones (Sí / Tengo dudas / No) con su conteo y las
// iniciales de quién votó encima. Tocar el propio voto lo saca. Abajo, quién
// falta. Pensado para ir sobre la nota (lima o card): hereda el color.
export function Votacion({
  ideaId,
  votos,
  socios,
  miSocioId,
}: {
  ideaId: string
  votos: Pick<VotoIdea, "socio_id" | "valor">[]
  socios: Pick<Socio, "id" | "nombre">[]
  miSocioId: string | null
}) {
  const [pendiente, iniciarTransicion] = useTransition()
  const [vista, cambiarOptimista] = useOptimistic(
    votos,
    (actual: Pick<VotoIdea, "socio_id" | "valor">[], valor: ValorVoto) => {
      if (!miSocioId) return actual
      const mio = actual.find((v) => v.socio_id === miSocioId)
      const sinMio = actual.filter((v) => v.socio_id !== miSocioId)
      return mio?.valor === valor ? sinMio : [...sinMio, { socio_id: miSocioId, valor }]
    }
  )

  const nombre = (id: string) =>
    id === miSocioId ? "Vos" : (socios.find((s) => s.id === id)?.nombre.split(" ")[0] ?? "?")
  const mio = vista.find((v) => v.socio_id === miSocioId)?.valor ?? null
  const faltan = socios
    .filter((s) => !vista.some((v) => v.socio_id === s.id))
    .map((s) => (s.id === miSocioId ? "vos" : s.nombre.split(" ")[0]))

  function votar(valor: ValorVoto) {
    iniciarTransicion(async () => {
      cambiarOptimista(valor)
      try {
        await votarIdea(ideaId, valor)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar el voto")
      }
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-[10px] bg-white/45 p-3.5 dark:bg-black/10">
      <span className="text-[11px] leading-[14px] font-bold tracking-[0.04em] uppercase opacity-60">¿La hacemos?</span>
      <div role="group" aria-label="Tu voto" className="flex gap-1.5 pt-1.5">
        {VALORES_VOTO_ORDEN.map((valor) => {
          const Icono = ICONO[valor]
          const quienes = vista.filter((v) => v.valor === valor)
          const on = mio === valor
          return (
            <button
              key={valor}
              type="button"
              aria-pressed={on}
              disabled={!miSocioId}
              onClick={() => votar(valor)}
              aria-label={`${VALORES_VOTO[valor].label}: ${quienes.length} ${quienes.length === 1 ? "voto" : "votos"}${on ? ", tu voto" : ""}`}
              className={cn(
                "zq-voto relative flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] border px-1.5 text-sm",
                on ? "border-carbon bg-carbon text-crema" : "border-current/25 bg-transparent",
                pendiente && "cursor-progress"
              )}
            >
              <Icono className="size-4" aria-hidden="true" />
              {VALORES_VOTO[valor].label}
              <strong className="zq-num">{quienes.length}</strong>
              {quienes.length > 0 && (
                <span className="absolute -top-2.5 -right-1 flex gap-0.5" aria-hidden="true">
                  {quienes.map((q) => (
                    <span
                      key={q.socio_id}
                      title={nombre(q.socio_id)}
                      className="inline-flex size-5 items-center justify-center rounded-full bg-crema text-[9px] font-bold text-carbon ring-2 ring-lima"
                    >
                      {iniciales(socios.find((s) => s.id === q.socio_id)?.nombre ?? "?")}
                    </span>
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <span className="text-xs opacity-70">
        {faltan.length === 0
          ? `Votaron los ${socios.length}`
          : `${faltan.length === 1 ? "Falta" : "Faltan"} ${enumerar(faltan)}`}
      </span>
    </div>
  )
}

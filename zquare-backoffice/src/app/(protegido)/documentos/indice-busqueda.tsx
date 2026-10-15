"use client"

import { useState } from "react"
import { RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

import { indexar, type EstadoIndice } from "./indice-actions"

// Estado y actualización del índice de búsqueda semántica, en una línea bajo
// el buscador ("44 de 59 documentos indexados · Actualizar índice"). La indexación
// procesa de a lotes: seguimos llamando a la action hasta que no queden
// pendientes (así no chocamos con el timeout de Vercel).
export function IndiceBusqueda({ estado, totalArchivos }: { estado: EstadoIndice; totalArchivos: number }) {
  const [corriendo, setCorriendo] = useState(false)
  const [progreso, setProgreso] = useState<string | null>(null)

  async function actualizar() {
    setCorriendo(true)
    setProgreso("Indexando…")
    let total = 0
    const errores: string[] = []
    try {
      // Tope de vueltas por si algo queda trabado.
      for (let vuelta = 0; vuelta < 40; vuelta++) {
        const r = await indexar()
        total += r.procesados
        errores.push(...r.errores)
        setProgreso(
          `Indexados ${total} documentos${r.pendientes > 0 ? `, faltan ${r.pendientes}…` : "."}`
        )
        if (r.pendientes === 0) break
        // Sin avance en toda una pasada: cortar en vez de reintentar infinito
        // (los errores acumulados se muestran abajo).
        if (r.procesados === 0) break
      }
      if (errores.length > 0) {
        toast.error(`Índice actualizado con ${errores.length} errores`, {
          description: errores.slice(0, 3).join(" · "),
        })
      } else {
        toast.success(
          total > 0
            ? `Índice actualizado: ${total} documentos procesados.`
            : "El índice ya estaba al día."
        )
      }
      // Refrescar los contadores del server component.
      window.location.reload()
    } catch (e) {
      toast.error("Falló la indexación", {
        description: (e as Error).message,
      })
      setCorriendo(false)
      setProgreso(null)
    }
  }

  return (
    <p className="m-0 flex flex-wrap items-center justify-center gap-x-1.5 text-[13px] text-muted-foreground" aria-live="polite">
      {!estado.driveConfigurado
        ? "Drive no está configurado en este entorno."
        : corriendo
          ? (progreso ?? "Indexando…")
          : `${estado.archivosIndexados} de ${totalArchivos} documentos indexados`}
      {estado.driveConfigurado && (
        <>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={actualizar}
            disabled={corriendo}
            className="inline-flex items-center gap-1 font-semibold text-foreground underline-offset-2 hover:underline disabled:opacity-60"
          >
            <RefreshCwIcon className={cn("size-3.5", corriendo && "animate-spin")} aria-hidden="true" />
            Actualizar índice
          </button>
        </>
      )}
    </p>
  )
}

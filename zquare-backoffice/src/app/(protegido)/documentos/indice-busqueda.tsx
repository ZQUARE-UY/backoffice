"use client"

import { useState } from "react"
import { RefreshCwIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { indexar, type EstadoIndice } from "./indice-actions"

// Estado y actualización del índice de búsqueda semántica. La indexación
// procesa de a lotes: seguimos llamando a la action hasta que no queden
// pendientes (así no chocamos con el timeout de Vercel).
export function IndiceBusqueda({ estado }: { estado: EstadoIndice }) {
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SparklesIcon className="size-4" />
          Búsqueda semántica
        </CardTitle>
        <CardDescription>
          Indexa el contenido de los archivos de Drive y las decisiones para
          poder buscarlos por significado desde ⌘K (por ejemplo: “propuesta de
          contabilidad para Iberpark”).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <p className="text-sm text-muted-foreground">
          {estado.fragmentos === 0
            ? "Todavía no hay nada indexado."
            : `${estado.documentos} documentos indexados (${estado.fragmentos} fragmentos).`}
          {!estado.driveConfigurado && " Drive no está configurado."}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={actualizar}
          disabled={corriendo}
        >
          <RefreshCwIcon
            className={corriendo ? "animate-spin" : undefined}
          />
          {corriendo ? (progreso ?? "Indexando…") : "Actualizar índice"}
        </Button>
      </CardContent>
    </Card>
  )
}

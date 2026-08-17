"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

// Copia un prompt al portapapeles para pegarlo donde cada uno prefiera
// conversar con Claude: la web, la app de escritorio, un proyecto con más
// contexto o Claude Code. El botón confirma en el propio label —un toast solo
// no alcanza cuando lo siguiente que hacés es cambiar de ventana— y vuelve a
// su estado normal a los dos segundos.
export function CopiarPrompt({
  prompt,
  children,
  copiado: etiquetaCopiado = "Copiado",
  ...props
}: {
  prompt: string
  children: React.ReactNode
  copiado?: string
} & Omit<React.ComponentProps<typeof Button>, "onClick" | "children">) {
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (!copiado) return
    const id = setTimeout(() => setCopiado(false), 2000)
    return () => clearTimeout(id)
  }, [copiado])

  async function onCopiar() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopiado(true)
    } catch {
      // Falla si el navegador no da permiso o la página no es segura: mostrar
      // el texto es mejor que dejar a la persona sin nada que pegar.
      toast.error("No se pudo copiar. El prompt es:", {
        description: prompt,
        duration: 30000,
      })
    }
  }

  return (
    <Button onClick={onCopiar} {...props}>
      {copiado ? (
        <>
          <CheckIcon data-icon="inline-start" />
          {etiquetaCopiado}
        </>
      ) : (
        <>
          <CopyIcon data-icon="inline-start" />
          {children}
        </>
      )}
    </Button>
  )
}

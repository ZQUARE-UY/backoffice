"use client"

import { useTransition } from "react"
import { FileTextIcon } from "lucide-react"
import { toast } from "sonner"

import { generarDocumento } from "@/app/(protegido)/presupuestos/actions"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

// Genera el Google Doc de la propuesta en la carpeta Presupuestos/ del
// cliente. Mientras está en borrador, volver a generarlo pisa el mismo Doc.
export function GenerarDocumento({
  presupuestoId,
  yaGenerado,
}: {
  presupuestoId: string
  yaGenerado: boolean
}) {
  const [pendiente, iniciarTransicion] = useTransition()

  function generar() {
    iniciarTransicion(async () => {
      const resultado = await generarDocumento(presupuestoId)
      if ("error" in resultado) {
        toast.error(resultado.error)
        return
      }
      toast.success(resultado.regenerado ? "Documento actualizado" : "Documento creado en Drive", {
        action: {
          label: "Abrir",
          onClick: () => window.open(resultado.url, "_blank", "noopener"),
        },
      })
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={generar} disabled={pendiente}>
      {pendiente ? <Spinner data-icon="inline-start" /> : <FileTextIcon data-icon="inline-start" />}
      {yaGenerado ? "Regenerar documento" : "Generar documento"}
    </Button>
  )
}

"use client"

import { useState, useTransition } from "react"
import { FolderPlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import { crearCarpetaClienteExistente } from "../actions"

export function CrearCarpetaDrive({ clienteId }: { clienteId: string }) {
  const [pendiente, iniciarTransicion] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onCrear() {
    setError(null)
    iniciarTransicion(async () => {
      try {
        await crearCarpetaClienteExistente(clienteId)
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo crear la carpeta")
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" disabled={pendiente} onClick={onCrear}>
        {pendiente ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <FolderPlusIcon data-icon="inline-start" />
        )}
        Crear carpeta en Drive
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}

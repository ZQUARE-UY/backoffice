"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { PencilIcon } from "lucide-react"

import { BotonEliminar } from "@/components/boton-eliminar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { codigoIdea, type Idea } from "@/lib/dominio"

import { actualizarIdea, eliminarIdea } from "../actions"
import { CamposIdea } from "../campos-idea"

export function IdeaAcciones({ idea }: { idea: Idea }) {
  const router = useRouter()
  const [editar, setEditar] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function onGuardar(formData: FormData) {
    iniciarTransicion(async () => {
      await actualizarIdea(idea.id, formData)
      setEditar(false)
    })
  }

  return (
    <div className={cn("flex items-center gap-2")}>
      <Button variant="outline" size="sm" onClick={() => setEditar(true)}>
        <PencilIcon data-icon="inline-start" />
        Editar
      </Button>
      <BotonEliminar
        accion={async () => {
          await eliminarIdea(idea.id)
          router.push("/ideas")
        }}
        titulo={`¿Eliminar ${codigoIdea(idea.numero)}?`}
        descripcion="La idea deja de verse en el banco. Se puede recuperar desde la base si hiciera falta."
      />

      <Dialog open={editar} onOpenChange={setEditar}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {editar && (
            <form action={onGuardar}>
              <DialogHeader>
                <DialogTitle>
                  Editar {codigoIdea(idea.numero)}
                </DialogTitle>
              </DialogHeader>
              <CamposIdea idea={idea} />
              <DialogFooter>
                <Button type="submit" disabled={pendiente}>
                  {pendiente && <Spinner data-icon="inline-start" />}
                  Guardar cambios
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

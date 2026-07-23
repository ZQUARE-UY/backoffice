"use client"

import { useState, useTransition } from "react"
import { PlusIcon } from "lucide-react"

import { crearDocumento } from "@/app/(protegido)/documentos/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { type Proyecto } from "@/lib/dominio"

import { CamposDocumento } from "./campos-documento"

export function NuevoDocumento({
  clienteId,
  proyectos,
}: {
  clienteId: string
  proyectos: Pick<Proyecto, "id" | "nombre">[]
}) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function onSubmit(formData: FormData) {
    iniciarTransicion(async () => {
      await crearDocumento(formData)
      setAbierto(false)
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <PlusIcon data-icon="inline-start" />
            Nuevo documento
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        {abierto && (
          <form action={onSubmit}>
            <input type="hidden" name="cliente_id" value={clienteId} />
            <DialogHeader>
              <DialogTitle>Nuevo documento</DialogTitle>
              <DialogDescription>
                El archivo vive en Drive; acá guardás el link y sus datos.
              </DialogDescription>
            </DialogHeader>
            <CamposDocumento proyectos={proyectos} />
            <DialogFooter>
              <Button type="submit" disabled={pendiente}>
                {pendiente && <Spinner data-icon="inline-start" />}
                Agregar documento
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { useState, useTransition } from "react"
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react"

import {
  actualizarDocumento,
  eliminarDocumento,
} from "@/app/(protegido)/documentos/actions"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { type Documento, type Proyecto } from "@/lib/dominio"

import { CamposDocumento } from "./campos-documento"

export function DocumentoAcciones({
  documento,
  proyectos,
}: {
  documento: Documento
  proyectos: Pick<Proyecto, "id" | "nombre">[]
}) {
  const [editar, setEditar] = useState(false)
  const [eliminar, setEliminar] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function onGuardar(formData: FormData) {
    iniciarTransicion(async () => {
      await actualizarDocumento(documento.id, documento.cliente_id, formData)
      setEditar(false)
    })
  }

  function onEliminar() {
    iniciarTransicion(async () => {
      await eliminarDocumento(documento.id, documento.cliente_id)
      setEliminar(false)
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Acciones">
              <MoreHorizontalIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setEditar(true)}>
              <PencilIcon />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setEliminar(true)}
            >
              <Trash2Icon />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editar} onOpenChange={setEditar}>
        <DialogContent className="sm:max-w-lg">
          {editar && (
            <form action={onGuardar}>
              <DialogHeader>
                <DialogTitle>Editar documento</DialogTitle>
              </DialogHeader>
              <CamposDocumento documento={documento} proyectos={proyectos} />
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

      <AlertDialog open={eliminar} onOpenChange={setEliminar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar &quot;{documento.titulo}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se quita del backoffice. El archivo en Drive no se toca.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendiente}
              onClick={(e) => {
                e.preventDefault()
                onEliminar()
              }}
            >
              {pendiente && <Spinner data-icon="inline-start" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

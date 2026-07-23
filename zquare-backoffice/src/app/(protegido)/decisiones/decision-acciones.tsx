"use client"

import { useState, useTransition } from "react"
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react"

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
import { type Cliente, type Decision, type Socio } from "@/lib/dominio"

import { actualizarDecision, eliminarDecision } from "./actions"
import { CamposDecision } from "./campos-decision"

export function DecisionAcciones({
  decision,
  socios,
  clientes,
}: {
  decision: Decision
  socios: Socio[]
  clientes: Pick<Cliente, "id" | "nombre">[]
}) {
  const [editar, setEditar] = useState(false)
  const [eliminar, setEliminar] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function onGuardar(formData: FormData) {
    iniciarTransicion(async () => {
      await actualizarDecision(decision.id, formData)
      setEditar(false)
    })
  }

  function onEliminar() {
    iniciarTransicion(async () => {
      await eliminarDecision(decision.id)
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
                <DialogTitle>Editar decisión</DialogTitle>
              </DialogHeader>
              <CamposDecision
                decision={decision}
                socios={socios}
                clientes={clientes}
              />
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
              ¿Eliminar &quot;{decision.titulo}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se quita de la bitácora. Podés recuperarla desde la base si hace
              falta.
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

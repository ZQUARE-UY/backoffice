"use client"

import { useState, useTransition } from "react"
import {
  MoreHorizontalIcon,
  PencilIcon,
  RepeatIcon,
  Trash2Icon,
} from "lucide-react"

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
import {
  type Cliente,
  type Movimiento,
  type MovimientoParticipacion,
  type MovimientoRecurrente,
  type Proyecto,
  type Socio,
} from "@/lib/dominio"

import { actualizarMovimiento, eliminarMovimiento } from "./actions"
import { CamposMovimiento } from "./campos-movimiento"
import { DialogoRecurrente } from "./recurrentes"

export function MovimientoAcciones({
  movimiento,
  recurrente,
  socios,
  clientes,
  proyectos,
  reparto,
}: {
  movimiento: Movimiento
  // La plantilla de la que salió este cobro, si sigue existiendo.
  recurrente?: MovimientoRecurrente
  socios: Socio[]
  clientes: Pick<Cliente, "id" | "nombre">[]
  proyectos: Pick<Proyecto, "id" | "nombre" | "cliente_id">[]
  reparto: MovimientoParticipacion[]
}) {
  const [editar, setEditar] = useState(false)
  const [editarRecurrente, setEditarRecurrente] = useState(false)
  const [eliminar, setEliminar] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function onGuardar(formData: FormData) {
    iniciarTransicion(async () => {
      await actualizarMovimiento(movimiento.id, formData)
      setEditar(false)
    })
  }

  function onEliminar() {
    iniciarTransicion(async () => {
      await eliminarMovimiento(movimiento.id)
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {editar && (
            <form action={onGuardar}>
              <DialogHeader>
                <DialogTitle>Editar movimiento</DialogTitle>
              </DialogHeader>
              {/* Un cobro generado por un recurrente se edita solo: para
                  cambiar todos, está la plantilla. */}
              {movimiento.recurrente_id && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">
                    Es un cobro de un recurrente. Lo que cambies acá afecta solo a
                    este cobro.
                  </span>
                  {recurrente && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditar(false)
                        setEditarRecurrente(true)
                      }}
                    >
                      <RepeatIcon data-icon="inline-start" />
                      Editar el recurrente
                    </Button>
                  )}
                </div>
              )}
              <CamposMovimiento
                permitirRecurrente={!movimiento.recurrente_id}
                movimiento={movimiento}
                socios={socios}
                clientes={clientes}
                proyectos={proyectos}
                reparto={reparto}
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

      {recurrente && (
        <DialogoRecurrente
          abierto={editarRecurrente}
          onCerrar={() => setEditarRecurrente(false)}
          recurrente={recurrente}
          socios={socios}
          clientes={clientes}
          proyectos={proyectos}
        />
      )}

      <AlertDialog open={eliminar} onOpenChange={setEliminar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este movimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quita del registro. Podés recuperarlo desde la base si hace
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

"use client"

import { useTransition } from "react"
import { Trash2Icon } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export function BotonEliminar({
  accion,
  titulo,
  descripcion,
  soloIcono = false,
}: {
  accion: () => Promise<void>
  titulo: string
  descripcion: string
  // Ícono de tacho en negativo, sin texto (fichas del rediseño).
  soloIcono?: boolean
}) {
  const [pendiente, iniciarTransicion] = useTransition()

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          soloIcono ? (
            <Button variant="ghost" size="icon" aria-label="Eliminar" className="text-negativo hover:text-negativo">
              <Trash2Icon />
            </Button>
          ) : (
            <Button variant="destructive" size="sm">
              <Trash2Icon data-icon="inline-start" />
              Eliminar
            </Button>
          )
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descripcion}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={pendiente}
            onClick={(e) => {
              e.preventDefault()
              iniciarTransicion(() => accion())
            }}
          >
            {pendiente && <Spinner data-icon="inline-start" />}
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

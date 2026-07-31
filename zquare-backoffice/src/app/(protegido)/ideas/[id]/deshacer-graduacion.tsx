"use client"

import { useState, useTransition } from "react"
import { Undo2Icon } from "lucide-react"

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
import { Spinner } from "@/components/ui/spinner"
import { codigoIdea, codigoTarea } from "@/lib/dominio"

import { deshacerGraduacion } from "../actions"

export function DeshacerGraduacion({
  ideaId,
  numero,
  proyecto,
  tareas,
}: {
  ideaId: string
  numero: number
  proyecto: string | null
  tareas: number[]
}) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  const generado = [
    proyecto && `el proyecto "${proyecto}"`,
    tareas.length > 0 &&
      `${tareas.length === 1 ? "la tarea" : "las tareas"} ${tareas
        .map(codigoTarea)
        .join(", ")}`,
  ].filter(Boolean)

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        className="ml-auto text-muted-foreground"
        onClick={() => setAbierto(true)}
      >
        <Undo2Icon data-icon="inline-start" />
        Deshacer
      </Button>

      <AlertDialog open={abierto} onOpenChange={setAbierto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Deshacer la graduación de {codigoIdea(numero)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se archiva {generado.join(" y ")}, y la idea vuelve a
              &quot;lista&quot; con su one-pager intacto. Lo archivado se puede
              recuperar desde la base si hiciera falta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendiente}
              onClick={(e) => {
                e.preventDefault()
                iniciarTransicion(async () => {
                  await deshacerGraduacion(ideaId)
                  setAbierto(false)
                })
              }}
            >
              {pendiente && <Spinner data-icon="inline-start" />}
              Deshacer graduación
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

"use client"

import { useState, useTransition } from "react"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { type EstadoTarea, type Socio, type Sprint } from "@/lib/dominio"

import { crearTarea } from "./actions"
import {
  CamposTarea,
  type ClienteOpcion,
  type ProyectoOpcion,
} from "./campos-tarea"

export function NuevaTarea({
  socios,
  clientes,
  proyectos,
  sprints = [],
  estadoInicial,
  sprintInicial,
  variante = "boton",
}: {
  socios: Socio[]
  clientes: ClienteOpcion[]
  proyectos: ProyectoOpcion[]
  sprints?: Sprint[]
  estadoInicial?: EstadoTarea
  sprintInicial?: string | null
  variante?: "boton" | "columna"
}) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function onSubmit(formData: FormData) {
    iniciarTransicion(async () => {
      await crearTarea(formData)
      setAbierto(false)
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          variante === "columna" ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
            >
              <PlusIcon data-icon="inline-start" />
              Agregar tarjeta
            </Button>
          ) : (
            <Button>
              <PlusIcon data-icon="inline-start" />
              Nueva tarea
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-2xl">
        {abierto && (
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>Nueva tarea</DialogTitle>
            </DialogHeader>
            <CamposTarea
              estadoInicial={estadoInicial}
              sprintInicial={sprintInicial}
              socios={socios}
              clientes={clientes}
              proyectos={proyectos}
              sprints={sprints}
            />
            <DialogFooter>
              <Button type="submit" disabled={pendiente}>
                {pendiente && <Spinner data-icon="inline-start" />}
                Crear tarea
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

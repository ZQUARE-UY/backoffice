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
import { type Cliente, type Proyecto, type Socio } from "@/lib/dominio"

import { crearMovimiento } from "./actions"
import { CamposMovimiento } from "./campos-movimiento"

export function NuevoMovimiento({
  socios,
  clientes,
  proyectos,
}: {
  socios: Socio[]
  clientes: Pick<Cliente, "id" | "nombre">[]
  proyectos: Pick<Proyecto, "id" | "nombre" | "cliente_id">[]
}) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function onSubmit(formData: FormData) {
    iniciarTransicion(async () => {
      await crearMovimiento(formData)
      setAbierto(false)
    })
  }

  return (
    // Mientras se guarda no se cierra: el fin del guardado cerraría un
    // movimiento nuevo que se haya abierto en el medio.
    <Dialog open={abierto} onOpenChange={(v) => !pendiente && setAbierto(v)}>
      <DialogTrigger
        render={
          <Button>
            <PlusIcon data-icon="inline-start" />
            Nuevo movimiento
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        {abierto && (
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>Nuevo movimiento</DialogTitle>
            </DialogHeader>
            <CamposMovimiento
              socios={socios}
              clientes={clientes}
              proyectos={proyectos}
            />
            <DialogFooter>
              <Button type="submit" disabled={pendiente}>
                {pendiente && <Spinner data-icon="inline-start" />}
                Guardar movimiento
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

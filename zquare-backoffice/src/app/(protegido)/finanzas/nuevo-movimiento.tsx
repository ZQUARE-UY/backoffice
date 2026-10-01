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

// Alta única de movimientos: el checkbox "Se repite" lo convierte en un
// recurrente. La tarjeta Recurrentes abre este mismo diálogo con el checkbox
// tildado (`recurrente`).
export function NuevoMovimiento({
  socios,
  clientes,
  proyectos,
  recurrente = false,
}: {
  socios: Socio[]
  clientes: Pick<Cliente, "id" | "nombre">[]
  proyectos: Pick<Proyecto, "id" | "nombre" | "cliente_id">[]
  recurrente?: boolean
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
          recurrente ? (
            <Button variant="outline" size="sm">
              <PlusIcon data-icon="inline-start" />
              Nuevo recurrente
            </Button>
          ) : (
            <Button>
              <PlusIcon data-icon="inline-start" />
              Nuevo movimiento
            </Button>
          )
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {abierto && (
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>{recurrente ? "Nuevo recurrente" : "Nuevo movimiento"}</DialogTitle>
            </DialogHeader>
            <CamposMovimiento
              permitirRecurrente
              seRepiteInicial={recurrente}
              socios={socios}
              clientes={clientes}
              proyectos={proyectos}
            />
            <DialogFooter>
              <Button type="submit" disabled={pendiente}>
                {pendiente && <Spinner data-icon="inline-start" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

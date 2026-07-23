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
import { type Cliente, type Socio } from "@/lib/dominio"

import { crearDecision } from "./actions"
import { CamposDecision } from "./campos-decision"

export function NuevaDecision({
  socios,
  clientes,
}: {
  socios: Socio[]
  clientes: Pick<Cliente, "id" | "nombre">[]
}) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function onSubmit(formData: FormData) {
    iniciarTransicion(async () => {
      await crearDecision(formData)
      setAbierto(false)
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button>
            <PlusIcon data-icon="inline-start" />
            Nueva decisión
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        {abierto && (
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>Nueva decisión</DialogTitle>
            </DialogHeader>
            <CamposDecision socios={socios} clientes={clientes} />
            <DialogFooter>
              <Button type="submit" disabled={pendiente}>
                {pendiente && <Spinner data-icon="inline-start" />}
                Guardar decisión
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

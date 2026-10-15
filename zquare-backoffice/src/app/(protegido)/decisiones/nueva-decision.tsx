"use client"

import { useEffect, useState, useTransition } from "react"
import { PlusIcon } from "lucide-react"

import { EVENTO_CREAR } from "@/components/captura-rapida"
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
import { CamposDecision, type OpcionReunion } from "./campos-decision"

export function NuevaDecision({
  socios,
  clientes,
  reuniones,
  acuerdo = false,
  escucharCrear = false,
}: {
  socios: Socio[]
  clientes: Pick<Cliente, "id" | "nombre">[]
  reuniones: OpcionReunion[]
  // "+ Nuevo acuerdo" en la tarjeta de acuerdos de socios: la misma alta,
  // sin cliente (un acuerdo de socios es una decisión de la empresa).
  acuerdo?: boolean
  // El botón flotante "+" de celular abre esta alta.
  escucharCrear?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  useEffect(() => {
    if (!escucharCrear) return
    function abrir(e: Event) {
      e.preventDefault()
      setAbierto(true)
    }
    window.addEventListener(EVENTO_CREAR, abrir)
    return () => window.removeEventListener(EVENTO_CREAR, abrir)
  }, [escucharCrear])

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
          acuerdo ? (
            <Button size="sm" className="bg-lima text-carbon hover:bg-lima/90">
              <PlusIcon data-icon="inline-start" />
              Nuevo acuerdo
            </Button>
          ) : (
            <Button>
              <PlusIcon data-icon="inline-start" />
              Nueva decisión
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-lg">
        {abierto && (
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>{acuerdo ? "Nuevo acuerdo de socios" : "Nueva decisión"}</DialogTitle>
            </DialogHeader>
            <CamposDecision socios={socios} clientes={clientes} reuniones={reuniones} />
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

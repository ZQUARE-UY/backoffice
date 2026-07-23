"use client"

import { useState } from "react"
import { useFormStatus } from "react-dom"
import { PlusIcon } from "lucide-react"

import { crearPresupuesto } from "@/app/(protegido)/presupuestos/actions"
import { SelectCampo } from "@/components/select-campo"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { MONEDAS, type Proyecto } from "@/lib/dominio"

function BotonGuardar() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Spinner data-icon="inline-start" />}
      Crear presupuesto
    </Button>
  )
}

export function NuevoPresupuesto({
  clienteId,
  proyectos,
}: {
  clienteId: string
  proyectos: Pick<Proyecto, "id" | "nombre">[]
}) {
  const [abierto, setAbierto] = useState(false)

  const opcionesProyecto = [
    { valor: "", label: "Sin proyecto" },
    ...proyectos.map((p) => ({ valor: p.id, label: p.nombre })),
  ]

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <PlusIcon data-icon="inline-start" />
            Nuevo presupuesto
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form action={crearPresupuesto}>
          <input type="hidden" name="cliente_id" value={clienteId} />
          <DialogHeader>
            <DialogTitle>Nuevo presupuesto</DialogTitle>
            <DialogDescription>
              Se crea como borrador. Después le cargás los ítems.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="moneda">Moneda</FieldLabel>
              <SelectCampo
                id="moneda"
                name="moneda"
                defaultValue="USD"
                opciones={MONEDAS.map((m) => ({ valor: m, label: m }))}
              />
            </Field>
            {proyectos.length > 0 && (
              <Field>
                <FieldLabel htmlFor="proyecto_id">Proyecto (opcional)</FieldLabel>
                <SelectCampo
                  id="proyecto_id"
                  name="proyecto_id"
                  defaultValue=""
                  opciones={opcionesProyecto}
                />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="notas">Notas</FieldLabel>
              <Textarea id="notas" name="notas" rows={2} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <BotonGuardar />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

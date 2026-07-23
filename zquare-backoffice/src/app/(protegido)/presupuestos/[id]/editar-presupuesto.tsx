"use client"

import { useState, useTransition } from "react"
import { PencilIcon } from "lucide-react"

import { actualizarPresupuesto } from "@/app/(protegido)/presupuestos/actions"
import { SelectCampo } from "@/components/select-campo"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  ESTADOS_PRESUPUESTO,
  MONEDAS,
  type Presupuesto,
} from "@/lib/dominio"

export function EditarPresupuesto({
  presupuesto,
}: {
  presupuesto: Presupuesto
}) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function onSubmit(formData: FormData) {
    iniciarTransicion(async () => {
      await actualizarPresupuesto(presupuesto.id, formData)
      setAbierto(false)
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <PencilIcon data-icon="inline-start" />
            Editar
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        {abierto && (
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>Editar presupuesto</DialogTitle>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="estado">Estado</FieldLabel>
                <SelectCampo
                  id="estado"
                  name="estado"
                  defaultValue={presupuesto.estado}
                  opciones={Object.entries(ESTADOS_PRESUPUESTO).map(
                    ([valor, info]) => ({ valor, label: info.label })
                  )}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="moneda">Moneda</FieldLabel>
                <SelectCampo
                  id="moneda"
                  name="moneda"
                  defaultValue={presupuesto.moneda}
                  opciones={MONEDAS.map((m) => ({ valor: m, label: m }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="fecha_envio">Fecha de envío</FieldLabel>
                <Input
                  id="fecha_envio"
                  name="fecha_envio"
                  type="date"
                  defaultValue={presupuesto.fecha_envio ?? ""}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="drive_url">Link al documento</FieldLabel>
                <Input
                  id="drive_url"
                  name="drive_url"
                  type="url"
                  placeholder="https://drive.google.com/..."
                  defaultValue={presupuesto.drive_url ?? ""}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="notas">Notas</FieldLabel>
                <Textarea
                  id="notas"
                  name="notas"
                  rows={3}
                  defaultValue={presupuesto.notas ?? ""}
                />
              </Field>
            </FieldGroup>
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
  )
}

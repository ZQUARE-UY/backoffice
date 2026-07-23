"use client"

import { useState } from "react"
import { useFormStatus } from "react-dom"
import { PlusIcon } from "lucide-react"

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
import { Input } from "@/components/ui/input"
import { SelectCampo } from "@/components/select-campo"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ESTADOS_PROYECTO, MONEDAS } from "@/lib/dominio"

import { crearProyecto } from "../actions"

function BotonGuardar() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Spinner data-icon="inline-start" />}
      Crear proyecto
    </Button>
  )
}

export function NuevoProyecto({ clienteId }: { clienteId: string }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <PlusIcon data-icon="inline-start" />
            Nuevo proyecto
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <form action={crearProyecto}>
          <input type="hidden" name="cliente_id" value={clienteId} />
          <DialogHeader>
            <DialogTitle>Nuevo proyecto</DialogTitle>
            <DialogDescription>
              Solo el nombre es obligatorio. Cargá el resto a medida que avanza.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="nombre">Nombre *</FieldLabel>
              <Input id="nombre" name="nombre" required autoFocus />
            </Field>
            <Field>
              <FieldLabel htmlFor="descripcion">Descripción</FieldLabel>
              <Textarea id="descripcion" name="descripcion" rows={3} />
            </Field>
            <Field>
              <FieldLabel htmlFor="estado">Estado</FieldLabel>
              <SelectCampo
                id="estado"
                name="estado"
                defaultValue="propuesta"
                opciones={Object.entries(ESTADOS_PROYECTO).map(
                  ([valor, info]) => ({ valor, label: info.label })
                )}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="fecha_inicio">Inicio</FieldLabel>
                <Input id="fecha_inicio" name="fecha_inicio" type="date" />
              </Field>
              <Field>
                <FieldLabel htmlFor="fecha_fin_estimada">
                  Fin estimado
                </FieldLabel>
                <Input
                  id="fecha_fin_estimada"
                  name="fecha_fin_estimada"
                  type="date"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="horas_estimadas">
                  Horas estimadas
                </FieldLabel>
                <Input
                  id="horas_estimadas"
                  name="horas_estimadas"
                  type="number"
                  min="0"
                  step="0.5"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="monto_acordado">Monto</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="monto_acordado"
                    name="monto_acordado"
                    type="number"
                    min="0"
                    step="0.01"
                    className="flex-1"
                  />
                  <SelectCampo
                    name="moneda"
                    defaultValue="USD"
                    triggerClassName="w-24"
                    opciones={MONEDAS.map((m) => ({ valor: m, label: m }))}
                  />
                </div>
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter>
            <BotonGuardar />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { useState, useTransition } from "react"
import { PencilIcon } from "lucide-react"

import { actualizarProyecto } from "@/app/(protegido)/clientes/actions"
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
import { ESTADOS_PROYECTO, MONEDAS, type Proyecto } from "@/lib/dominio"

export function EditarProyecto({ proyecto }: { proyecto: Proyecto }) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function onSubmit(formData: FormData) {
    iniciarTransicion(async () => {
      await actualizarProyecto(proyecto.id, formData)
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
      <DialogContent className="sm:max-w-lg">
        {abierto && (
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>Editar proyecto</DialogTitle>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="nombre">Nombre *</FieldLabel>
                <Input
                  id="nombre"
                  name="nombre"
                  required
                  defaultValue={proyecto.nombre}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="descripcion">Descripción</FieldLabel>
                <Textarea
                  id="descripcion"
                  name="descripcion"
                  rows={3}
                  defaultValue={proyecto.descripcion ?? ""}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="estado">Estado</FieldLabel>
                <SelectCampo
                  id="estado"
                  name="estado"
                  defaultValue={proyecto.estado}
                  opciones={Object.entries(ESTADOS_PROYECTO).map(
                    ([valor, info]) => ({ valor, label: info.label }),
                  )}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="fecha_inicio">Inicio</FieldLabel>
                  <Input
                    id="fecha_inicio"
                    name="fecha_inicio"
                    type="date"
                    defaultValue={proyecto.fecha_inicio ?? ""}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="fecha_fin_estimada">
                    Fin estimado
                  </FieldLabel>
                  <Input
                    id="fecha_fin_estimada"
                    name="fecha_fin_estimada"
                    type="date"
                    defaultValue={proyecto.fecha_fin_estimada ?? ""}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="fecha_fin_real">Fin real</FieldLabel>
                <Input
                  id="fecha_fin_real"
                  name="fecha_fin_real"
                  type="date"
                  defaultValue={proyecto.fecha_fin_real ?? ""}
                />
              </Field>
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
                    defaultValue={proyecto.horas_estimadas ?? ""}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="horas_reales">Horas reales</FieldLabel>
                  <Input
                    id="horas_reales"
                    name="horas_reales"
                    type="number"
                    min="0"
                    step="0.5"
                    defaultValue={proyecto.horas_reales ?? ""}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="monto_acordado">Monto acordado</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="monto_acordado"
                    name="monto_acordado"
                    type="number"
                    min="0"
                    step="0.01"
                    className="flex-1"
                    defaultValue={proyecto.monto_acordado ?? ""}
                  />
                  <SelectCampo
                    name="moneda"
                    defaultValue={proyecto.moneda ?? "USD"}
                    triggerClassName="w-24"
                    opciones={MONEDAS.map((m) => ({ valor: m, label: m }))}
                  />
                </div>
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

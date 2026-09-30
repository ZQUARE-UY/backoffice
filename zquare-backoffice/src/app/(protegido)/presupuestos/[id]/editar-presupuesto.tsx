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
  TIPOS_PROYECTO,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {abierto && (
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>Editar presupuesto</DialogTitle>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="titulo">Título</FieldLabel>
                <Input
                  id="titulo"
                  name="titulo"
                  placeholder="Nombre de la propuesta, ej. Iber Store Vision"
                  defaultValue={presupuesto.titulo ?? ""}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
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
                  <FieldLabel htmlFor="tipo">Tipo de trabajo</FieldLabel>
                  <SelectCampo
                    id="tipo"
                    name="tipo"
                    defaultValue={presupuesto.tipo ?? ""}
                    opciones={[
                      { valor: "", label: "Sin definir" },
                      ...Object.entries(TIPOS_PROYECTO).map(([valor, t]) => ({
                        valor,
                        label: t.label,
                      })),
                    ]}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="plazo_estimado_semanas">
                    Plazo estimado (semanas)
                  </FieldLabel>
                  <Input
                    id="plazo_estimado_semanas"
                    name="plazo_estimado_semanas"
                    type="number"
                    min="0.5"
                    step="0.5"
                    defaultValue={presupuesto.plazo_estimado_semanas ?? ""}
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
                  <FieldLabel htmlFor="fecha_respuesta">Fecha de respuesta</FieldLabel>
                  <Input
                    id="fecha_respuesta"
                    name="fecha_respuesta"
                    type="date"
                    defaultValue={presupuesto.fecha_respuesta ?? ""}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="motivo_resultado">
                  Por qué se aprobó o rechazó
                </FieldLabel>
                <Textarea
                  id="motivo_resultado"
                  name="motivo_resultado"
                  rows={2}
                  placeholder="Lo que dijo el cliente. Es lo que más sirve para el próximo presupuesto."
                  defaultValue={presupuesto.motivo_resultado ?? ""}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="etiquetas">Etiquetas</FieldLabel>
                <Input
                  id="etiquetas"
                  name="etiquetas"
                  placeholder="separadas por coma: computer-vision, odoo, chatbot"
                  defaultValue={(presupuesto.etiquetas ?? []).join(", ")}
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
                <FieldLabel htmlFor="contenido">Propuesta (Markdown)</FieldLabel>
                <Textarea
                  id="contenido"
                  name="contenido"
                  rows={12}
                  className="font-mono text-xs"
                  placeholder="## Contexto&#10;&#10;## Qué resuelve&#10;&#10;## Alcance funcional"
                  defaultValue={presupuesto.contenido ?? ""}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="notas">Notas internas</FieldLabel>
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

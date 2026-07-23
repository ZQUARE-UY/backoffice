"use client"

import { useState, useTransition } from "react"
import { PencilIcon } from "lucide-react"

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
import { ESTADOS_CLIENTE, type Cliente } from "@/lib/dominio"

import { actualizarCliente } from "../actions"

export function EditarCliente({ cliente }: { cliente: Cliente }) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function onSubmit(formData: FormData) {
    iniciarTransicion(async () => {
      await actualizarCliente(cliente.id, formData)
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
            <DialogTitle>Editar cliente</DialogTitle>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="nombre">Nombre *</FieldLabel>
              <Input
                id="nombre"
                name="nombre"
                required
                defaultValue={cliente.nombre}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="empresa">Empresa</FieldLabel>
              <Input
                id="empresa"
                name="empresa"
                defaultValue={cliente.empresa ?? ""}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="estado">Estado</FieldLabel>
              <SelectCampo
                id="estado"
                name="estado"
                defaultValue={cliente.estado}
                opciones={Object.entries(ESTADOS_CLIENTE).map(
                  ([valor, info]) => ({ valor, label: info.label })
                )}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={cliente.email ?? ""}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="telefono">Teléfono</FieldLabel>
              <Input
                id="telefono"
                name="telefono"
                defaultValue={cliente.telefono ?? ""}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="origen">Origen</FieldLabel>
              <Input
                id="origen"
                name="origen"
                defaultValue={cliente.origen ?? ""}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="notas">Notas</FieldLabel>
              <Textarea
                id="notas"
                name="notas"
                rows={3}
                defaultValue={cliente.notas ?? ""}
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

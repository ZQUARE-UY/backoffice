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
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { SelectCampo } from "@/components/select-campo"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ESTADOS_CLIENTE } from "@/lib/dominio"

import { crearCliente } from "./actions"

function BotonGuardar() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Spinner data-icon="inline-start" />}
      Crear cliente
    </Button>
  )
}

export function NuevoCliente() {
  const [abierto, setAbierto] = useState(false)

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button>
            <PlusIcon data-icon="inline-start" />
            Nuevo cliente
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <form action={crearCliente}>
          <DialogHeader>
            <DialogTitle>Nuevo cliente</DialogTitle>
            <DialogDescription>
              Solo el nombre es obligatorio. El resto lo completás cuando
              quieras.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="nombre">Nombre *</FieldLabel>
              <Input id="nombre" name="nombre" required autoFocus />
              <FieldDescription>
                Persona de contacto o razón social.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="empresa">Empresa</FieldLabel>
              <Input id="empresa" name="empresa" />
            </Field>
            <Field>
              <FieldLabel htmlFor="estado">Estado</FieldLabel>
              <SelectCampo
                id="estado"
                name="estado"
                defaultValue="potencial"
                opciones={Object.entries(ESTADOS_CLIENTE).map(
                  ([valor, info]) => ({ valor, label: info.label })
                )}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" type="email" />
            </Field>
            <Field>
              <FieldLabel htmlFor="telefono">Teléfono</FieldLabel>
              <Input id="telefono" name="telefono" />
            </Field>
            <Field>
              <FieldLabel htmlFor="origen">Origen</FieldLabel>
              <Input id="origen" name="origen" />
              <FieldDescription>
                Cómo llegó (referido, web, LinkedIn…).
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="notas">Notas</FieldLabel>
              <Textarea id="notas" name="notas" rows={3} />
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

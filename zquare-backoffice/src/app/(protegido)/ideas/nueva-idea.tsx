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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

import { crearIdea } from "./actions"

// Captura rápida: que anotar una idea nunca dé pereza. Solo título y una
// línea de contexto; nace como semilla y el one-pager se completa iterando
// con Claude o editando el detalle.
export function NuevaIdea() {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function onSubmit(formData: FormData) {
    iniciarTransicion(async () => {
      await crearIdea(formData)
      setAbierto(false)
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button>
            <PlusIcon data-icon="inline-start" />
            Nueva idea
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        {abierto && (
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>Nueva idea</DialogTitle>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="titulo">Título *</FieldLabel>
                <Input
                  id="titulo"
                  name="titulo"
                  required
                  placeholder="La idea en una frase"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="descripcion">
                  Contexto (opcional)
                </FieldLabel>
                <Textarea
                  id="descripcion"
                  name="descripcion"
                  rows={3}
                  placeholder="De dónde salió, por qué vale la pena mirarla"
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={pendiente}>
                {pendiente && <Spinner data-icon="inline-start" />}
                Guardar semilla
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

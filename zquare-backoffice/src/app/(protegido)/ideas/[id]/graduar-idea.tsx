"use client"

import { useState, useTransition } from "react"
import { GraduationCapIcon } from "lucide-react"

import { SelectCampo } from "@/components/select-campo"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { codigoIdea, type Idea } from "@/lib/dominio"

import { graduarIdea } from "../actions"

// Graduación: la idea aprobada se convierte en trabajo real. Ideas grandes
// gradúan a proyecto interno (con sus tareas); ideas chicas, a tareas
// sueltas del kanban.
export function GraduarIdea({ idea }: { idea: Idea }) {
  const [abierto, setAbierto] = useState(false)
  const [destino, setDestino] = useState("proyecto")
  const [pendiente, iniciarTransicion] = useTransition()

  function onGraduar(formData: FormData) {
    iniciarTransicion(async () => {
      await graduarIdea(idea.id, formData)
      setAbierto(false)
    })
  }

  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}>
        <GraduationCapIcon data-icon="inline-start" />
        Graduar
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-lg">
          {abierto && (
            <form action={onGraduar}>
              <DialogHeader>
                <DialogTitle>Graduar {codigoIdea(idea.numero)}</DialogTitle>
              </DialogHeader>
              <FieldGroup className="py-4">
                <Field>
                  <FieldLabel htmlFor="destino">Convertir en</FieldLabel>
                  <SelectCampo
                    id="destino"
                    name="destino"
                    defaultValue="proyecto"
                    onValueChange={setDestino}
                    opciones={[
                      {
                        valor: "proyecto",
                        label: "Proyecto interno (con sus tareas)",
                      },
                      { valor: "tareas", label: "Tareas sueltas del kanban" },
                    ]}
                  />
                </Field>
                {destino === "proyecto" && (
                  <Field>
                    <FieldLabel htmlFor="proyecto_nombre">
                      Nombre del proyecto *
                    </FieldLabel>
                    <Input
                      id="proyecto_nombre"
                      name="proyecto_nombre"
                      required
                      defaultValue={idea.titulo}
                    />
                  </Field>
                )}
                <Field>
                  <FieldLabel htmlFor="tareas">
                    Tareas iniciales (una por línea
                    {destino === "proyecto" ? ", opcional" : ""})
                  </FieldLabel>
                  <Textarea
                    id="tareas"
                    name="tareas"
                    rows={5}
                    required={destino === "tareas"}
                    placeholder={
                      "Los próximos pasos del one-pager son el punto de partida:\nBuild de la v1\nDiseño del sticker\n..."
                    }
                  />
                </Field>
                <p className="text-sm text-muted-foreground">
                  La idea pasa a <strong>aprobada</strong> y queda vinculada a
                  lo que genere. Las tareas entran arriba del backlog con la
                  etiqueta {codigoIdea(idea.numero)}.
                </p>
              </FieldGroup>
              <DialogFooter>
                <Button type="submit" disabled={pendiente}>
                  {pendiente && <Spinner data-icon="inline-start" />}
                  Graduar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

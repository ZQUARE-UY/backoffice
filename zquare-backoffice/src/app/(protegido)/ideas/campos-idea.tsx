"use client"

import { SelectCampo } from "@/components/select-campo"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  ESTADOS_IDEA,
  ESTADOS_IDEA_ORDEN,
  ONE_PAGER_IDEA,
  type CampoOnePager,
  type Idea,
} from "@/lib/dominio"

// Formulario completo de una idea (edición). La captura rápida usa solo
// título + descripción (ver nueva-idea.tsx); el one-pager se completa
// iterando con Claude o editando acá.
export function CamposIdea({ idea }: { idea?: Idea }) {
  return (
    <FieldGroup className="py-4">
      <Field>
        <FieldLabel htmlFor="titulo">Título *</FieldLabel>
        <Input
          id="titulo"
          name="titulo"
          required
          placeholder="La idea en una frase"
          defaultValue={idea?.titulo ?? ""}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="descripcion">Descripción</FieldLabel>
        <Textarea
          id="descripcion"
          name="descripcion"
          rows={3}
          placeholder="Contexto libre: de dónde salió, notas sueltas"
          defaultValue={idea?.descripcion ?? ""}
        />
      </Field>
      {(Object.keys(ONE_PAGER_IDEA) as CampoOnePager[]).map((campo) => (
        <Field key={campo}>
          <FieldLabel htmlFor={campo}>{ONE_PAGER_IDEA[campo].label}</FieldLabel>
          <Textarea
            id={campo}
            name={campo}
            rows={3}
            placeholder={ONE_PAGER_IDEA[campo].placeholder}
            defaultValue={idea?.[campo] ?? ""}
          />
        </Field>
      ))}
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="estado">Estado</FieldLabel>
          <SelectCampo
            id="estado"
            name="estado"
            defaultValue={idea?.estado ?? "semilla"}
            opciones={ESTADOS_IDEA_ORDEN.map((e) => ({
              valor: e,
              label: ESTADOS_IDEA[e].label,
            }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="etiquetas">Etiquetas</FieldLabel>
          <Input
            id="etiquetas"
            name="etiquetas"
            placeholder="separadas, por, coma"
            defaultValue={idea?.etiquetas?.join(", ") ?? ""}
          />
        </Field>
      </div>
    </FieldGroup>
  )
}

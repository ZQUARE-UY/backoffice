"use client"

import { SelectCampo } from "@/components/select-campo"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { TIPOS_DOCUMENTO, type Documento, type Proyecto } from "@/lib/dominio"

export function CamposDocumento({
  documento,
  proyectos,
}: {
  documento?: Documento
  proyectos: Pick<Proyecto, "id" | "nombre">[]
}) {
  const opcionesProyecto = [
    { valor: "", label: "Sin proyecto" },
    ...proyectos.map((p) => ({ valor: p.id, label: p.nombre })),
  ]

  return (
    <FieldGroup className="py-4">
      <Field>
        <FieldLabel htmlFor="titulo">Título *</FieldLabel>
        <Input
          id="titulo"
          name="titulo"
          required
          defaultValue={documento?.titulo ?? ""}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="drive_url">Link al documento *</FieldLabel>
        <Input
          id="drive_url"
          name="drive_url"
          type="url"
          required
          placeholder="https://drive.google.com/..."
          defaultValue={documento?.drive_url ?? ""}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="tipo">Tipo</FieldLabel>
        <SelectCampo
          id="tipo"
          name="tipo"
          defaultValue={documento?.tipo ?? "otro"}
          opciones={Object.entries(TIPOS_DOCUMENTO).map(([valor, info]) => ({
            valor,
            label: info.label,
          }))}
        />
      </Field>
      {proyectos.length > 0 && (
        <Field>
          <FieldLabel htmlFor="proyecto_id">Proyecto (opcional)</FieldLabel>
          <SelectCampo
            id="proyecto_id"
            name="proyecto_id"
            defaultValue={documento?.proyecto_id ?? ""}
            opciones={opcionesProyecto}
          />
        </Field>
      )}
      <Field>
        <FieldLabel htmlFor="fecha">Fecha</FieldLabel>
        <Input
          id="fecha"
          name="fecha"
          type="date"
          defaultValue={documento?.fecha ?? ""}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="tags">Etiquetas</FieldLabel>
        <Input
          id="tags"
          name="tags"
          placeholder="separadas por coma"
          defaultValue={documento?.tags?.join(", ") ?? ""}
        />
      </Field>
    </FieldGroup>
  )
}

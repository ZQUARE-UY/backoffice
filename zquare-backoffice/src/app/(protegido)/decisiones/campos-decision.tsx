"use client"

import { SelectCampo } from "@/components/select-campo"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { type Cliente, type Decision, type Socio } from "@/lib/dominio"

export function CamposDecision({
  decision,
  socios,
  clientes,
}: {
  decision?: Decision
  socios: Socio[]
  clientes: Pick<Cliente, "id" | "nombre">[]
}) {
  const opcionesCliente = [
    { valor: "", label: "Sin cliente (decisión de empresa)" },
    ...clientes.map((c) => ({ valor: c.id, label: c.nombre })),
  ]

  return (
    <FieldGroup className="py-4">
      <Field>
        <FieldLabel htmlFor="titulo">Título *</FieldLabel>
        <Input
          id="titulo"
          name="titulo"
          required
          placeholder="Qué se decidió"
          defaultValue={decision?.titulo ?? ""}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="detalle">Detalle</FieldLabel>
        <Textarea
          id="detalle"
          name="detalle"
          rows={4}
          placeholder="Contexto y fundamentación"
          defaultValue={decision?.detalle ?? ""}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="fecha">Fecha</FieldLabel>
        <Input
          id="fecha"
          name="fecha"
          type="date"
          defaultValue={decision?.fecha ?? ""}
        />
      </Field>
      <Field>
        <FieldLabel>Participantes</FieldLabel>
        <div className="flex flex-wrap gap-4 pt-1">
          {socios.map((socio) => (
            <label
              key={socio.id}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                name="participantes"
                value={socio.nombre}
                defaultChecked={decision?.participantes?.includes(socio.nombre)}
                className="size-4 accent-primary"
              />
              {socio.nombre}
            </label>
          ))}
        </div>
      </Field>
      <Field>
        <FieldLabel htmlFor="cliente_id">Cliente (opcional)</FieldLabel>
        <SelectCampo
          id="cliente_id"
          name="cliente_id"
          defaultValue={decision?.cliente_id ?? ""}
          opciones={opcionesCliente}
        />
      </Field>
    </FieldGroup>
  )
}

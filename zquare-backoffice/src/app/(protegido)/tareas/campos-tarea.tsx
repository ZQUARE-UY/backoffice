"use client"

import { SelectCampo } from "@/components/select-campo"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  ESTADOS_TAREA,
  ESTADOS_TAREA_ORDEN,
  PRIORIDADES_TAREA,
  type EstadoTarea,
  type Socio,
  type Tarea,
} from "@/lib/dominio"

export type ProyectoOpcion = { id: string; nombre: string; cliente: string }
export type ClienteOpcion = { id: string; nombre: string }

export function CamposTarea({
  tarea,
  estadoInicial,
  socios,
  clientes,
  proyectos,
}: {
  tarea?: Tarea
  estadoInicial?: EstadoTarea
  socios: Socio[]
  clientes: ClienteOpcion[]
  proyectos: ProyectoOpcion[]
}) {
  return (
    <FieldGroup className="py-4">
      <Field>
        <FieldLabel htmlFor="titulo">Título *</FieldLabel>
        <Input
          id="titulo"
          name="titulo"
          required
          placeholder="Qué hay que hacer"
          defaultValue={tarea?.titulo ?? ""}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="descripcion">Descripción</FieldLabel>
        <Textarea
          id="descripcion"
          name="descripcion"
          rows={4}
          placeholder="Contexto, criterios de aceptación, links"
          defaultValue={tarea?.descripcion ?? ""}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="estado">Columna</FieldLabel>
          <SelectCampo
            id="estado"
            name="estado"
            defaultValue={tarea?.estado ?? estadoInicial ?? "backlog"}
            opciones={ESTADOS_TAREA_ORDEN.map((e) => ({
              valor: e,
              label: ESTADOS_TAREA[e].label,
            }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="prioridad">Prioridad</FieldLabel>
          <SelectCampo
            id="prioridad"
            name="prioridad"
            defaultValue={tarea?.prioridad ?? "media"}
            opciones={Object.entries(PRIORIDADES_TAREA).map(([valor, p]) => ({
              valor,
              label: p.label,
            }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="asignado_a">Responsable</FieldLabel>
          <SelectCampo
            id="asignado_a"
            name="asignado_a"
            defaultValue={tarea?.asignado_a ?? ""}
            opciones={[
              { valor: "", label: "Sin asignar" },
              ...socios.map((s) => ({ valor: s.id, label: s.nombre })),
            ]}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="fecha_limite">Fecha límite</FieldLabel>
          <Input
            id="fecha_limite"
            name="fecha_limite"
            type="date"
            defaultValue={tarea?.fecha_limite ?? ""}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cliente_id">Cliente</FieldLabel>
          <SelectCampo
            id="cliente_id"
            name="cliente_id"
            defaultValue={tarea?.cliente_id ?? ""}
            opciones={[
              { valor: "", label: "Sin cliente (tarea de empresa)" },
              ...clientes.map((c) => ({ valor: c.id, label: c.nombre })),
            ]}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="proyecto_id">Proyecto</FieldLabel>
          <SelectCampo
            id="proyecto_id"
            name="proyecto_id"
            defaultValue={tarea?.proyecto_id ?? ""}
            opciones={[
              { valor: "", label: "Sin proyecto" },
              ...proyectos.map((p) => ({
                valor: p.id,
                label: `${p.cliente} — ${p.nombre}`,
              })),
            ]}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="etiquetas">Etiquetas</FieldLabel>
        <Input
          id="etiquetas"
          name="etiquetas"
          placeholder="separadas por coma: bug, urgente, backoffice"
          defaultValue={tarea?.etiquetas?.join(", ") ?? ""}
        />
      </Field>
    </FieldGroup>
  )
}

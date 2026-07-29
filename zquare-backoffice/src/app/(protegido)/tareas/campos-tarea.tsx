"use client"

import { useState } from "react"

import { SelectCampo } from "@/components/select-campo"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  BRIEF_TAREA,
  briefVacio,
  CAMPOS_BRIEF,
  ESTADOS_TAREA,
  ESTADOS_TAREA_ORDEN,
  PRIORIDADES_TAREA,
  type EstadoTarea,
  type Socio,
  type Tarea,
} from "@/lib/dominio"

export type ProyectoOpcion = {
  id: string
  nombre: string
  cliente: string
  cliente_id: string | null
}
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
  // Cascada cliente → proyecto: con un cliente elegido solo se ofrecen sus
  // proyectos (evita guardar un proyecto de otro cliente); sin cliente se ven
  // todos, etiquetados con su cliente.
  const [clienteSel, setClienteSel] = useState(tarea?.cliente_id ?? "")
  const proyectosVisibles = clienteSel
    ? proyectos.filter((p) => p.cliente_id === clienteSel)
    : proyectos
  const proyectoActual = proyectosVisibles.some((p) => p.id === tarea?.proyecto_id)
    ? tarea?.proyecto_id ?? ""
    : ""

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
          placeholder="Notas rápidas; el detalle va en el brief de abajo"
          defaultValue={tarea?.descripcion ?? ""}
        />
      </Field>
      {/* Colapsado por defecto: el brief normalmente lo completa Claude, no se
          tipea a mano. Los campos de un <details> cerrado igual viajan en el
          FormData. */}
      <details open={tarea ? !briefVacio(tarea) : undefined} className="group">
        <summary className="cursor-pointer text-sm font-medium select-none">
          Brief de desarrollo
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            Normalmente lo completa Claude («desarrollá ZQ-N» con el conector)
          </span>
        </summary>
        <div className="flex flex-col gap-4 pt-4">
          {CAMPOS_BRIEF.map((campo) => (
            <Field key={campo}>
              <FieldLabel htmlFor={campo}>{BRIEF_TAREA[campo].label}</FieldLabel>
              <Textarea
                id={campo}
                name={campo}
                rows={3}
                placeholder={BRIEF_TAREA[campo].placeholder}
                defaultValue={tarea?.[campo] ?? ""}
              />
            </Field>
          ))}
        </div>
      </details>
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
            onValueChange={setClienteSel}
            opciones={[
              { valor: "", label: "Sin cliente (tarea de empresa)" },
              ...clientes.map((c) => ({ valor: c.id, label: c.nombre })),
            ]}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="proyecto_id">Proyecto</FieldLabel>
          {/* key: al cambiar el cliente se remonta el select para que el
              defaultValue vuelva a una opción válida. */}
          <SelectCampo
            key={clienteSel}
            id="proyecto_id"
            name="proyecto_id"
            defaultValue={proyectoActual}
            opciones={[
              { valor: "", label: "Sin proyecto" },
              ...proyectosVisibles.map((p) => ({
                valor: p.id,
                label: clienteSel ? p.nombre : `${p.cliente} — ${p.nombre}`,
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

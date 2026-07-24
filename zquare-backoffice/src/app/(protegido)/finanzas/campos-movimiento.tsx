"use client"

import { useState } from "react"

import { SelectCampo } from "@/components/select-campo"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  CATEGORIAS_SUGERIDAS,
  MONEDAS,
  TIPOS_MOVIMIENTO,
  type Cliente,
  type Movimiento,
  type Socio,
} from "@/lib/dominio"

export function CamposMovimiento({
  movimiento,
  socios,
  clientes,
}: {
  movimiento?: Movimiento
  socios: Socio[]
  clientes: Pick<Cliente, "id" | "nombre">[]
}) {
  const [moneda, setMoneda] = useState<string>(movimiento?.moneda ?? "USD")

  const opcionesTipo = Object.entries(TIPOS_MOVIMIENTO).map(([valor, t]) => ({
    valor,
    label: t.label,
  }))
  const opcionesMoneda = MONEDAS.map((m) => ({ valor: m, label: m }))
  const opcionesSocio = [
    { valor: "", label: "Sin socio" },
    ...socios.map((s) => ({ valor: s.id, label: s.nombre })),
  ]
  const opcionesCliente = [
    { valor: "", label: "Sin cliente" },
    ...clientes.map((c) => ({ valor: c.id, label: c.nombre })),
  ]

  return (
    <FieldGroup className="py-4">
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="tipo">Tipo *</FieldLabel>
          <SelectCampo
            id="tipo"
            name="tipo"
            defaultValue={movimiento?.tipo ?? "gasto"}
            opciones={opcionesTipo}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="fecha">Fecha</FieldLabel>
          <Input
            id="fecha"
            name="fecha"
            type="date"
            defaultValue={movimiento?.fecha ?? ""}
          />
        </Field>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-4">
        <Field>
          <FieldLabel htmlFor="monto">Monto *</FieldLabel>
          <Input
            id="monto"
            name="monto"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="0.00"
            defaultValue={movimiento?.monto ?? ""}
          />
        </Field>
        <Field className="w-28">
          <FieldLabel htmlFor="moneda">Moneda</FieldLabel>
          <SelectCampo
            id="moneda"
            name="moneda"
            defaultValue={moneda}
            opciones={opcionesMoneda}
            onValueChange={setMoneda}
          />
        </Field>
      </div>

      {moneda === "UYU" && (
        <Field>
          <FieldLabel htmlFor="tc_a_usd">Tipo de cambio (UYU por 1 USD) *</FieldLabel>
          <Input
            id="tc_a_usd"
            name="tc_a_usd"
            type="number"
            step="0.0001"
            min="0"
            placeholder="Ej. 40"
            defaultValue={movimiento?.tc_a_usd ?? ""}
          />
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="categoria">Categoría</FieldLabel>
        <Input
          id="categoria"
          name="categoria"
          list="categorias-sugeridas"
          placeholder="Ej. Software y servicios"
          defaultValue={movimiento?.categoria ?? ""}
        />
        <datalist id="categorias-sugeridas">
          {CATEGORIAS_SUGERIDAS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>

      <Field>
        <FieldLabel htmlFor="descripcion">Descripción</FieldLabel>
        <Textarea
          id="descripcion"
          name="descripcion"
          rows={2}
          placeholder="Detalle del movimiento"
          defaultValue={movimiento?.descripcion ?? ""}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="socio_id">Socio</FieldLabel>
          <SelectCampo
            id="socio_id"
            name="socio_id"
            defaultValue={movimiento?.socio_id ?? ""}
            opciones={opcionesSocio}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cliente_id">Cliente</FieldLabel>
          <SelectCampo
            id="cliente_id"
            name="cliente_id"
            defaultValue={movimiento?.cliente_id ?? ""}
            opciones={opcionesCliente}
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="comprobante_url">Comprobante (link a Drive)</FieldLabel>
        <Input
          id="comprobante_url"
          name="comprobante_url"
          type="url"
          placeholder="https://drive.google.com/…"
          defaultValue={movimiento?.comprobante_url ?? ""}
        />
      </Field>
    </FieldGroup>
  )
}

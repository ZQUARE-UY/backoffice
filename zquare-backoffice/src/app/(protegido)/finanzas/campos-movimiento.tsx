"use client"

import { useState } from "react"

import { SelectCampo } from "@/components/select-campo"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  CATEGORIAS_SUGERIDAS,
  ESTADOS_MOVIMIENTO,
  FONDO_COMUN,
  formatearMonto,
  MONEDAS,
  TIPOS_MOVIMIENTO,
  type Cliente,
  type Movimiento,
  type MovimientoParticipacion,
  type Proyecto,
  type Socio,
} from "@/lib/dominio"

type ProyectoOpcion = Pick<Proyecto, "id" | "nombre" | "cliente_id">

// Cuántas partes le tocan a cada socio. `activo` false = no participa.
type Reparto = Record<string, { activo: boolean; partes: string }>

function repartoInicial(
  socios: Socio[],
  participaciones: MovimientoParticipacion[],
): Reparto {
  // Sin participaciones guardadas el movimiento se reparte en partes iguales
  // entre todos (es también lo que asume la vista de balance).
  const guardadas = new Map(participaciones.map((p) => [p.socio_id, p.partes]))
  const hayGuardadas = guardadas.size > 0
  return Object.fromEntries(
    socios.map((s) => [
      s.id,
      {
        activo: hayGuardadas ? guardadas.has(s.id) : true,
        partes: String(guardadas.get(s.id) ?? 1),
      },
    ]),
  )
}

export function CamposMovimiento({
  movimiento,
  socios,
  clientes,
  proyectos,
  reparto: repartoGuardado = [],
}: {
  movimiento?: Movimiento
  socios: Socio[]
  clientes: Pick<Cliente, "id" | "nombre">[]
  proyectos: ProyectoOpcion[]
  reparto?: MovimientoParticipacion[]
}) {
  const [moneda, setMoneda] = useState<string>(movimiento?.moneda ?? "USD")
  const [tipo, setTipo] = useState<string>(movimiento?.tipo ?? "gasto")
  const [clienteId, setClienteId] = useState<string>(
    movimiento?.cliente_id ?? "",
  )
  const [proyectoId, setProyectoId] = useState<string>(
    movimiento?.proyecto_id ?? "",
  )
  const [deQuien, setDeQuien] = useState<string>(
    movimiento?.socio_id ?? FONDO_COMUN,
  )
  const [monto, setMonto] = useState<string>(
    movimiento?.monto != null ? String(movimiento.monto) : "",
  )
  const [reparto, setReparto] = useState<Reparto>(() =>
    repartoInicial(socios, repartoGuardado),
  )

  const opcionesTipo = Object.entries(TIPOS_MOVIMIENTO).map(([valor, t]) => ({
    valor,
    label: t.label,
  }))
  const opcionesEstado = Object.entries(ESTADOS_MOVIMIENTO).map(
    ([valor, e]) => ({ valor, label: e.label }),
  )
  const opcionesMoneda = MONEDAS.map((m) => ({ valor: m, label: m }))
  const opcionesDeQuien = [
    { valor: FONDO_COMUN, label: "Fondo común (cuenta de la empresa)" },
    ...socios.map((s) => ({ valor: s.id, label: s.nombre })),
  ]
  const opcionesCliente = [
    { valor: "", label: "Sin cliente" },
    ...clientes.map((c) => ({ valor: c.id, label: c.nombre })),
  ]
  // Con un cliente elegido solo se ofrecen sus proyectos; sin cliente, todos
  // (incluidos los internos, que no tienen cliente_id).
  const proyectosVisibles = clienteId
    ? proyectos.filter((p) => p.cliente_id === clienteId)
    : proyectos
  const opcionesProyecto = [
    { valor: "", label: "Sin proyecto" },
    ...proyectosVisibles.map((p) => ({ valor: p.id, label: p.nombre })),
  ]

  // El reparto solo importa cuando la plata la puso o la cobró un socio: lo
  // que entra o sale del fondo común no le genera deuda a nadie.
  const repartir = deQuien !== FONDO_COMUN
  const participantes = socios.filter((s) => reparto[s.id]?.activo)
  const totalPartes = participantes.reduce(
    (acc, s) => acc + (Number(reparto[s.id]?.partes) || 0),
    0,
  )
  const montoNumero = Number(monto.replace(",", ".")) || 0

  function cambiarCliente(valor: string) {
    setClienteId(valor)
    // Si el proyecto elegido no es de ese cliente, deja de tener sentido.
    const sigueValiendo = proyectos.some(
      (p) => p.id === proyectoId && (!valor || p.cliente_id === valor),
    )
    if (!sigueValiendo) setProyectoId("")
  }

  function cambiarProyecto(valor: string) {
    setProyectoId(valor)
    // Elegir un proyecto de un cliente completa el cliente solo.
    const proyecto = proyectos.find((p) => p.id === valor)
    if (proyecto?.cliente_id) setClienteId(proyecto.cliente_id)
  }

  function alternarSocio(socioId: string, activo: boolean) {
    setReparto((r) => ({ ...r, [socioId]: { ...r[socioId], activo } }))
  }

  function cambiarPartes(socioId: string, partes: string) {
    setReparto((r) => ({ ...r, [socioId]: { ...r[socioId], partes } }))
  }

  return (
    <FieldGroup className="py-4">
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="tipo">Tipo *</FieldLabel>
          <SelectCampo
            id="tipo"
            name="tipo"
            defaultValue={tipo}
            opciones={opcionesTipo}
            onValueChange={setTipo}
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
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
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
          <FieldLabel htmlFor="tc_a_usd">
            Tipo de cambio (UYU por 1 USD) *
          </FieldLabel>
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
          <FieldLabel htmlFor="cliente_id">Cliente</FieldLabel>
          <SelectCampo
            id="cliente_id"
            name="cliente_id"
            value={clienteId}
            opciones={opcionesCliente}
            onValueChange={cambiarCliente}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="proyecto_id">Proyecto</FieldLabel>
          <SelectCampo
            id="proyecto_id"
            name="proyecto_id"
            value={proyectoId}
            opciones={opcionesProyecto}
            onValueChange={cambiarProyecto}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="pagado_por">
            {tipo === "gasto" ? "Pagado por" : "Cobrado por"}
          </FieldLabel>
          <SelectCampo
            id="pagado_por"
            name="pagado_por"
            value={deQuien}
            opciones={opcionesDeQuien}
            onValueChange={setDeQuien}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="estado">Estado</FieldLabel>
          <SelectCampo
            id="estado"
            name="estado"
            defaultValue={movimiento?.estado ?? "confirmado"}
            opciones={opcionesEstado}
          />
        </Field>
      </div>

      {repartir && (
        <Field>
          <FieldLabel>
            {tipo === "gasto" ? "Gasto a repartir entre" : "Ingreso a repartir entre"}
          </FieldLabel>
          <p className="text-xs text-muted-foreground">
            {tipo === "gasto"
              ? "Cada participante le queda debiendo su parte a quien pagó."
              : "Quien cobró le queda debiendo su parte a cada participante."}{" "}
            Las partes son relativas: 1 y 1 es mitad y mitad; 1 y 2, un tercio y
            dos tercios.
          </p>
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            {socios.map((s) => {
              const fila = reparto[s.id]
              const partes = Number(fila?.partes) || 0
              const cuota =
                fila?.activo && totalPartes > 0
                  ? (montoNumero * partes) / totalPartes
                  : 0
              return (
                <div key={s.id} className="flex items-center gap-3">
                  <Checkbox
                    id={`participa-${s.id}`}
                    checked={fila?.activo ?? false}
                    onCheckedChange={(v) => alternarSocio(s.id, v === true)}
                  />
                  <label
                    htmlFor={`participa-${s.id}`}
                    className="flex-1 text-sm"
                  >
                    {s.nombre}
                  </label>
                  {fila?.activo && (
                    <>
                      <Input
                        aria-label={`Partes de ${s.nombre}`}
                        type="number"
                        step="0.5"
                        min="0.0001"
                        className="h-8 w-16"
                        value={fila.partes}
                        onChange={(e) => cambiarPartes(s.id, e.target.value)}
                      />
                      <span className="w-24 text-right text-sm tabular-nums text-muted-foreground">
                        {formatearMonto(cuota, moneda)}
                      </span>
                      <input type="hidden" name="participante" value={s.id} />
                      <input
                        type="hidden"
                        name={`partes_${s.id}`}
                        value={fila.partes}
                      />
                    </>
                  )}
                </div>
              )
            })}
          </div>
          {participantes.length === 0 && (
            <p className="text-xs text-destructive">
              Elegí al menos un participante.
            </p>
          )}
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="comprobante_url">
          Comprobante (link a Drive)
        </FieldLabel>
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

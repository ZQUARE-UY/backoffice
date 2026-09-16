"use client"

import { useState, useTransition } from "react"
import { ArrowRightIcon, HandCoinsIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { SelectCampo } from "@/components/select-campo"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  formatearMonto,
  formatearUsd,
  MONEDAS,
  type BalanceSocio,
  type Liquidacion,
  type Socio,
} from "@/lib/dominio"
import {
  transferenciasSugeridas,
  type TransferenciaSugerida,
} from "@/lib/finanzas"

import { crearLiquidacion, eliminarLiquidacion } from "./actions"

// Saldar el balance entre socios: las transferencias que lo dejan en cero y el
// historial de las que ya se hicieron. Una liquidación no es ingreso ni gasto:
// solo mueve el saldo entre quien transfiere y quien recibe.
export function Liquidaciones({
  balance,
  socios,
  liquidaciones,
  hoy,
}: {
  balance: BalanceSocio[]
  socios: Socio[]
  liquidaciones: Liquidacion[]
  hoy: string
}) {
  // undefined = cerrado; null = transferencia libre; objeto = sugerida.
  const [registrar, setRegistrar] = useState<
    TransferenciaSugerida | null | undefined
  >(undefined)
  // Cada apertura del diálogo es un formulario nuevo: con la key se remonta y
  // los selects toman los valores de la transferencia elegida, no los de la
  // anterior.
  const [apertura, setApertura] = useState(0)

  function abrir(sugerida: TransferenciaSugerida | null) {
    setApertura((n) => n + 1)
    setRegistrar(sugerida)
  }
  const nombre = new Map(socios.map((s) => [s.id, s.nombre]))
  const sugeridas = transferenciasSugeridas(balance)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saldar cuentas</CardTitle>
        <CardDescription>
          {sugeridas.length === 0
            ? "Están a mano: nadie le debe a nadie."
            : "Con estas transferencias el balance queda en cero. Registralas cuando las hagas."}
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => abrir(null)}>
            <PlusIcon data-icon="inline-start" />
            Otra transferencia
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {sugeridas.length > 0 && (
          <ul className="flex flex-col divide-y rounded-lg border">
            {sugeridas.map((t) => (
              <li
                key={`${t.de_socio_id}-${t.para_socio_id}`}
                className="flex items-center gap-3 px-3 py-2"
              >
                <HandCoinsIcon className="size-4 text-muted-foreground" />
                <span className="flex flex-1 flex-wrap items-center gap-1.5 text-sm">
                  <span className="font-medium">{nombre.get(t.de_socio_id)}</span>
                  <ArrowRightIcon className="size-3.5 text-muted-foreground" />
                  <span className="font-medium">
                    {nombre.get(t.para_socio_id)}
                  </span>
                </span>
                <span className="text-sm tabular-nums">
                  {formatearUsd(t.monto_usd)}
                </span>
                <Button size="sm" onClick={() => abrir(t)}>
                  Registrar
                </Button>
              </li>
            ))}
          </ul>
        )}

        {liquidaciones.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Transferencias registradas
            </h3>
            <ul className="flex flex-col divide-y rounded-lg border">
              {liquidaciones.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-24 text-sm tabular-nums text-muted-foreground">
                    {l.fecha}
                  </span>
                  <span className="flex flex-1 flex-col text-sm">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {nombre.get(l.de_socio_id) ?? "—"}
                      <ArrowRightIcon className="size-3.5 text-muted-foreground" />
                      {nombre.get(l.para_socio_id) ?? "—"}
                    </span>
                    {l.nota && (
                      <span className="text-xs text-muted-foreground">
                        {l.nota}
                      </span>
                    )}
                  </span>
                  <span className="text-sm tabular-nums">
                    {l.comprobante_url ? (
                      <a
                        href={l.comprobante_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {formatearMonto(l.monto, l.moneda)}
                      </a>
                    ) : (
                      formatearMonto(l.monto, l.moneda)
                    )}
                  </span>
                  <EliminarLiquidacion id={l.id} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <DialogoLiquidacion
        key={apertura}
        abierto={registrar !== undefined}
        sugerida={registrar ?? undefined}
        socios={socios}
        hoy={hoy}
        onCerrar={() => setRegistrar(undefined)}
      />
    </Card>
  )
}

function DialogoLiquidacion({
  abierto,
  sugerida,
  socios,
  hoy,
  onCerrar,
}: {
  abierto: boolean
  sugerida?: TransferenciaSugerida
  socios: Socio[]
  hoy: string
  onCerrar: () => void
}) {
  const [pendiente, iniciarTransicion] = useTransition()
  const [moneda, setMoneda] = useState("USD")
  const [de, setDe] = useState(sugerida?.de_socio_id ?? "")
  const [para, setPara] = useState(sugerida?.para_socio_id ?? "")
  const opcionesSocio = [
    { valor: "", label: "Elegí un socio" },
    ...socios.map((s) => ({ valor: s.id, label: s.nombre })),
  ]

  function onSubmit(formData: FormData) {
    iniciarTransicion(async () => {
      await crearLiquidacion(formData)
      // Después de un await hay que volver a marcar la transición: así el
      // cierre se pinta junto con la lista ya revalidada. Si se cerrara antes,
      // quedaría a la vista la sugerencia recién registrada y un click rápido
      // la registraría dos veces.
      iniciarTransicion(() => onCerrar())
    })
  }

  // Mientras se guarda no se puede cerrar: si se cerrara y se abriera otra
  // transferencia, el fin de este guardado cerraría la nueva a medio llenar.
  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && !pendiente && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        {abierto && (
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>Registrar transferencia</DialogTitle>
              <DialogDescription>
                Achica lo que debe quien transfiere y lo que le deben a quien
                recibe. No cuenta como ingreso ni gasto de la empresa.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="de_socio_id">Transfiere *</FieldLabel>
                  <SelectCampo
                    id="de_socio_id"
                    name="de_socio_id"
                    value={de}
                    opciones={opcionesSocio}
                    onValueChange={setDe}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="para_socio_id">Recibe *</FieldLabel>
                  <SelectCampo
                    id="para_socio_id"
                    name="para_socio_id"
                    value={para}
                    opciones={opcionesSocio}
                    onValueChange={setPara}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-4">
                <Field>
                  <FieldLabel htmlFor="monto_liquidacion">Monto *</FieldLabel>
                  <Input
                    id="monto_liquidacion"
                    name="monto"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    defaultValue={sugerida?.monto_usd ?? ""}
                  />
                </Field>
                <Field className="w-28">
                  <FieldLabel htmlFor="moneda_liquidacion">Moneda</FieldLabel>
                  <SelectCampo
                    id="moneda_liquidacion"
                    name="moneda"
                    defaultValue={moneda}
                    opciones={MONEDAS.map((m) => ({ valor: m, label: m }))}
                    onValueChange={setMoneda}
                  />
                </Field>
              </div>
              {moneda === "UYU" && (
                <Field>
                  <FieldLabel htmlFor="tc_liquidacion">
                    Tipo de cambio (UYU por 1 USD) *
                  </FieldLabel>
                  <Input
                    id="tc_liquidacion"
                    name="tc_a_usd"
                    type="number"
                    step="0.0001"
                    min="0"
                    required
                    placeholder="Ej. 40"
                  />
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="fecha_liquidacion">Fecha</FieldLabel>
                <Input
                  id="fecha_liquidacion"
                  name="fecha"
                  type="date"
                  defaultValue={hoy}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="nota_liquidacion">Nota</FieldLabel>
                <Input
                  id="nota_liquidacion"
                  name="nota"
                  placeholder="Ej. Reparto de PEO"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="comprobante_liquidacion">
                  Comprobante (link a Drive)
                </FieldLabel>
                <Input
                  id="comprobante_liquidacion"
                  name="comprobante_url"
                  type="url"
                  placeholder="https://drive.google.com/…"
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={pendiente}>
                {pendiente && <Spinner data-icon="inline-start" />}
                Registrar
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function EliminarLiquidacion({ id }: { id: string }) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Eliminar transferencia"
        onClick={() => setAbierto(true)}
      >
        <Trash2Icon />
      </Button>
      <AlertDialog open={abierto} onOpenChange={setAbierto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta transferencia?</AlertDialogTitle>
            <AlertDialogDescription>
              El balance vuelve a contar esa plata como pendiente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendiente}
              onClick={(e) => {
                e.preventDefault()
                iniciarTransicion(async () => {
                  await eliminarLiquidacion(id)
                  setAbierto(false)
                })
              }}
            >
              {pendiente && <Spinner data-icon="inline-start" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

"use client"

import { useState, useTransition } from "react"
import {
  MoreHorizontalIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  Trash2Icon,
} from "lucide-react"

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
import { Badge } from "@/components/ui/badge"
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  formatearMonto,
  formatearUsd,
  FRECUENCIAS_RECURRENTE,
  TIPOS_MOVIMIENTO,
  type Cliente,
  type MovimientoRecurrente,
  type Proyecto,
  type Socio,
} from "@/lib/dominio"
import { mensualUsd, proximaOcurrencia } from "@/lib/finanzas"

import {
  actualizarRecurrente,
  crearRecurrente,
  eliminarRecurrente,
  pausarRecurrente,
} from "./actions"
import { CamposMovimiento } from "./campos-movimiento"

type Props = {
  socios: Socio[]
  clientes: Pick<Cliente, "id" | "nombre">[]
  proyectos: Pick<Proyecto, "id" | "nombre" | "cliente_id">[]
}

// Plantillas de gastos (o ingresos) que se repiten, como Google Workspace. El
// cron diario las convierte en movimientos; acá se ven, se editan y se pausan.
export function Recurrentes({
  recurrentes,
  hoy,
  ...props
}: Props & { recurrentes: MovimientoRecurrente[]; hoy: string }) {
  const [nuevo, setNuevo] = useState(false)
  const nombreSocio = new Map(props.socios.map((s) => [s.id, s.nombre]))

  // Cuánto pesan por mes los gastos recurrentes activos, en USD.
  const gastoMensual = recurrentes
    .filter((r) => r.activo && r.tipo === "gasto")
    .filter((r) => proximaOcurrencia(r, hoy) != null)
    .reduce((acc, r) => acc + mensualUsd(r), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recurrentes</CardTitle>
        <CardDescription>
          {recurrentes.length === 0
            ? "Gastos que se repiten, como Google Workspace. Se cargan solos cada vez que vencen."
            : `Gastos fijos activos: ${formatearUsd(gastoMensual)} por mes. El próximo cobro de cada uno ya figura como previsto.`}
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setNuevo(true)}>
            <PlusIcon data-icon="inline-start" />
            Nuevo recurrente
          </Button>
        </CardAction>
      </CardHeader>

      {recurrentes.length > 0 && (
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Qué</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Paga / cobra</TableHead>
                <TableHead>Próximo</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {recurrentes.map((r) => {
                const proximo = proximaOcurrencia(r, hoy)
                return (
                  <TableRow
                    key={r.id}
                    className={r.activo && proximo ? "" : "opacity-60"}
                  >
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <RepeatIcon className="size-3.5 text-muted-foreground" />
                        <span className="font-medium">{r.descripcion}</span>
                        {r.tipo === "ingreso" && (
                          <Badge variant={TIPOS_MOVIMIENTO.ingreso.variant}>
                            {TIPOS_MOVIMIENTO.ingreso.label}
                          </Badge>
                        )}
                        {!r.activo && <Badge variant="outline">Pausado</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatearMonto(r.monto, r.moneda)}
                      <span className="text-muted-foreground">
                        {" / "}
                        {FRECUENCIAS_RECURRENTE[r.frecuencia].label.toLowerCase()}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.socio_id
                        ? (nombreSocio.get(r.socio_id) ?? "—")
                        : "Fondo común"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {!r.activo ? "—" : (proximo ?? "Terminado")}
                    </TableCell>
                    <TableCell>
                      <RecurrenteAcciones recurrente={r} {...props} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      )}

      <DialogoRecurrente abierto={nuevo} onCerrar={() => setNuevo(false)} {...props} />
    </Card>
  )
}

function DialogoRecurrente({
  abierto,
  onCerrar,
  recurrente,
  ...props
}: Props & {
  abierto: boolean
  onCerrar: () => void
  recurrente?: MovimientoRecurrente
}) {
  const [pendiente, iniciarTransicion] = useTransition()

  function onSubmit(formData: FormData) {
    iniciarTransicion(async () => {
      if (recurrente) await actualizarRecurrente(recurrente.id, formData)
      else await crearRecurrente(formData)
      onCerrar()
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {abierto && (
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>
                {recurrente ? "Editar recurrente" : "Nuevo recurrente"}
              </DialogTitle>
            </DialogHeader>
            <CamposMovimiento
              modo="recurrente"
              recurrente={recurrente}
              reparto={recurrente?.reparto}
              {...props}
            />
            <DialogFooter>
              <Button type="submit" disabled={pendiente}>
                {pendiente && <Spinner data-icon="inline-start" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RecurrenteAcciones({
  recurrente,
  ...props
}: Props & { recurrente: MovimientoRecurrente }) {
  const [editar, setEditar] = useState(false)
  const [eliminar, setEliminar] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Acciones">
              <MoreHorizontalIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setEditar(true)}>
              <PencilIcon />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={pendiente}
              onClick={() =>
                iniciarTransicion(() =>
                  pausarRecurrente(recurrente.id, !recurrente.activo),
                )
              }
            >
              {recurrente.activo ? <PauseIcon /> : <PlayIcon />}
              {recurrente.activo ? "Pausar" : "Reanudar"}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setEliminar(true)}
            >
              <Trash2Icon />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogoRecurrente
        abierto={editar}
        onCerrar={() => setEditar(false)}
        recurrente={recurrente}
        {...props}
      />

      <AlertDialog open={eliminar} onOpenChange={setEliminar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este recurrente?</AlertDialogTitle>
            <AlertDialogDescription>
              Deja de generarse. Los cobros que ya se registraron quedan como
              están; solo se quita el próximo, que estaba previsto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendiente}
              onClick={(e) => {
                e.preventDefault()
                iniciarTransicion(async () => {
                  await eliminarRecurrente(recurrente.id)
                  setEliminar(false)
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

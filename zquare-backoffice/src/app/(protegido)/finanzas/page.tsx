import Link from "next/link"
import { WalletIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
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
  TIPOS_MOVIMIENTO,
  type BalanceSocio,
  type Cliente,
  type Movimiento,
  type Socio,
} from "@/lib/dominio"
import { createClient } from "@/lib/supabase/server"

import { MovimientoAcciones } from "./movimiento-acciones"
import { NuevoMovimiento } from "./nuevo-movimiento"

export const metadata = { title: "Finanzas" }

function usd(monto: number): string {
  return formatearMonto(Math.round(monto * 100) / 100, "USD")
}

export default async function FinanzasPage() {
  const supabase = await createClient()

  const [
    { data: movimientosData },
    { data: sociosData },
    { data: clientesData },
    { data: balanceData },
  ] = await Promise.all([
    supabase
      .from("movimientos")
      .select("*")
      .is("deleted_at", null)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("socios").select("id, nombre, email").is("deleted_at", null),
    supabase
      .from("clientes")
      .select("id, nombre")
      .is("deleted_at", null)
      .order("nombre"),
    supabase.from("balance_socios").select("*").order("nombre"),
  ])

  const movimientos = (movimientosData ?? []) as Movimiento[]
  const socios = (sociosData ?? []) as Socio[]
  const clientes = (clientesData ?? []) as Pick<Cliente, "id" | "nombre">[]
  const balance = (balanceData ?? []) as BalanceSocio[]
  const nombreSocio = new Map(socios.map((s) => [s.id, s.nombre]))

  // Resultado del período (todo consolidado a USD).
  const ingresos = movimientos
    .filter((m) => m.tipo === "ingreso")
    .reduce((acc, m) => acc + m.monto_usd, 0)
  const gastos = movimientos
    .filter((m) => m.tipo === "gasto")
    .reduce((acc, m) => acc + m.monto_usd, 0)
  const resultado = ingresos - gastos

  // Balance entre socios: cuánto está cada uno respecto del promedio aportado.
  const totalAportado = balance.reduce((acc, b) => acc + b.aporte_neto_usd, 0)
  const promedio = balance.length > 0 ? totalAportado / balance.length : 0

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Finanzas</h1>
          <p className="text-muted-foreground">
            Ingresos, gastos y aportes de los socios, consolidado en USD.
          </p>
        </div>
        <NuevoMovimiento socios={socios} clientes={clientes} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Ingresos</CardDescription>
            <CardTitle className="text-2xl text-emerald-600 dark:text-emerald-500">
              {usd(ingresos)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Gastos</CardDescription>
            <CardTitle className="text-2xl text-destructive">
              {usd(gastos)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Resultado</CardDescription>
            <CardTitle className="text-2xl">{usd(resultado)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {balance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Balance de socios</CardTitle>
            <CardDescription>
              Aporte neto de cada socio (aportes menos retiros) y su diferencia
              contra el promedio. Un valor negativo indica cuánto le falta poner
              para emparejar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Socio</TableHead>
                  <TableHead className="text-right">Aporte neto</TableHead>
                  <TableHead className="text-right">vs. promedio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balance.map((b) => {
                  const diff = b.aporte_neto_usd - promedio
                  return (
                    <TableRow key={b.socio_id}>
                      <TableCell className="font-medium">{b.nombre}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {usd(b.aporte_neto_usd)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          diff < -0.005
                            ? "text-destructive"
                            : diff > 0.005
                              ? "text-emerald-600 dark:text-emerald-500"
                              : "text-muted-foreground"
                        }`}
                      >
                        {diff > 0.005 ? "+" : ""}
                        {usd(diff)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {movimientos.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WalletIcon />
            </EmptyMedia>
            <EmptyTitle>Sin movimientos</EmptyTitle>
            <EmptyDescription>
              Cargá el primer ingreso, gasto o aporte para empezar a llevar las
              finanzas de la empresa.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <NuevoMovimiento socios={socios} clientes={clientes} />
          </EmptyContent>
        </Empty>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead>Socio</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">USD</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimientos.map((m) => {
                const tipo = TIPOS_MOVIMIENTO[m.tipo]
                return (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {m.fecha}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tipo.variant}>{tipo.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{m.descripcion ?? m.categoria ?? "—"}</span>
                        {m.descripcion && m.categoria && (
                          <span className="text-xs text-muted-foreground">
                            {m.categoria}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.socio_id ? nombreSocio.get(m.socio_id) ?? "—" : "—"}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {m.comprobante_url ? (
                        <Link
                          href={m.comprobante_url}
                          target="_blank"
                          className="text-primary hover:underline"
                        >
                          {formatearMonto(m.monto, m.moneda)}
                        </Link>
                      ) : (
                        formatearMonto(m.monto, m.moneda)
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums text-muted-foreground">
                      {usd(m.monto_usd)}
                    </TableCell>
                    <TableCell>
                      <MovimientoAcciones
                        movimiento={m}
                        socios={socios}
                        clientes={clientes}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}

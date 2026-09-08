import Link from "next/link"
import { WalletIcon } from "lucide-react"

import { BalanceSociosTabla } from "@/components/balance-socios-tabla"
import { Badge } from "@/components/ui/badge"
import {
  Card,
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
  ESTADOS_MOVIMIENTO,
  formatearMonto,
  formatearUsd,
  TIPOS_MOVIMIENTO,
  type BalanceSocio,
  type Cliente,
  type Movimiento,
  type MovimientoParticipacion,
  type Proyecto,
  type Socio,
} from "@/lib/dominio"
import { createClient } from "@/lib/supabase/server"

import { MovimientoAcciones } from "./movimiento-acciones"
import { NuevoMovimiento } from "./nuevo-movimiento"

export const metadata = { title: "Finanzas" }

const usd = formatearUsd

export default async function FinanzasPage() {
  const supabase = await createClient()

  const [
    { data: movimientosData },
    { data: sociosData },
    { data: clientesData },
    { data: proyectosData },
    { data: participacionesData },
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
    supabase
      .from("proyectos")
      .select("id, nombre, cliente_id")
      .is("deleted_at", null)
      .order("nombre"),
    supabase.from("movimiento_participaciones").select("*"),
    supabase.from("balance_socios").select("*").order("nombre"),
  ])

  const movimientos = (movimientosData ?? []) as Movimiento[]
  const socios = (sociosData ?? []) as Socio[]
  const clientes = (clientesData ?? []) as Pick<Cliente, "id" | "nombre">[]
  const proyectos = (proyectosData ?? []) as Pick<
    Proyecto,
    "id" | "nombre" | "cliente_id"
  >[]
  const participaciones = (participacionesData ??
    []) as MovimientoParticipacion[]
  const balance = (balanceData ?? []) as BalanceSocio[]
  const nombreSocio = new Map(socios.map((s) => [s.id, s.nombre]))
  const nombreProyecto = new Map(proyectos.map((p) => [p.id, p.nombre]))

  // Participaciones agrupadas por movimiento, para el formulario de edición.
  const repartoPorMovimiento = new Map<string, MovimientoParticipacion[]>()
  for (const p of participaciones) {
    const filas = repartoPorMovimiento.get(p.movimiento_id) ?? []
    filas.push(p)
    repartoPorMovimiento.set(p.movimiento_id, filas)
  }

  // Los previstos son compromisos a futuro: no cuentan en el resultado ni en la
  // caja, se muestran aparte.
  const confirmados = movimientos.filter((m) => m.estado !== "previsto")
  const previstos = movimientos.filter((m) => m.estado === "previsto")
  const total = (
    lista: Movimiento[],
    tipo: Movimiento["tipo"],
    filtro: (m: Movimiento) => boolean = () => true,
  ) =>
    lista
      .filter((m) => m.tipo === tipo && filtro(m))
      .reduce((acc, m) => acc + m.monto_usd, 0)

  // Resultado del período (todo consolidado a USD).
  const ingresos = total(confirmados, "ingreso")
  const gastos = total(confirmados, "gasto")
  const resultado = ingresos - gastos

  // Caja del fondo común: solo lo que entró y salió de la cuenta de la empresa.
  // Lo que un socio cobró o pagó de su bolsillo no pasó por la caja; eso se
  // salda en el balance entre socios.
  const enFondo = (m: Movimiento) => m.socio_id == null
  const caja =
    total(confirmados, "ingreso", enFondo) - total(confirmados, "gasto", enFondo)

  // Comprometido a futuro: neto de los movimientos previstos.
  const comprometido = total(previstos, "ingreso") - total(previstos, "gasto")

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Finanzas</h1>
          <p className="text-muted-foreground">
            Ingresos y gastos de la empresa, consolidado en USD.
          </p>
        </div>
        <NuevoMovimiento
          socios={socios}
          clientes={clientes}
          proyectos={proyectos}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Caja (fondo común)</CardDescription>
            <CardTitle
              className={`text-2xl ${caja < 0 ? "text-destructive" : ""}`}
            >
              {usd(caja)}
            </CardTitle>
          </CardHeader>
        </Card>
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
        {previstos.length > 0 && (
          <Card>
            <CardHeader>
              <CardDescription>Comprometido (previsto)</CardDescription>
              <CardTitle className="text-2xl text-muted-foreground">
                {comprometido > 0 ? "+" : ""}
                {usd(comprometido)}
              </CardTitle>
            </CardHeader>
          </Card>
        )}
      </div>

      <BalanceSociosTabla balance={balance} />

      {movimientos.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WalletIcon />
            </EmptyMedia>
            <EmptyTitle>Sin movimientos</EmptyTitle>
            <EmptyDescription>
              Cargá el primer ingreso o gasto para empezar a llevar las finanzas
              de la empresa.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <NuevoMovimiento
              socios={socios}
              clientes={clientes}
              proyectos={proyectos}
            />
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
                <TableHead>Puso / cobró</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">USD</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimientos.map((m) => {
                const tipo = TIPOS_MOVIMIENTO[m.tipo]
                return (
                  <TableRow
                    key={m.id}
                    className={m.estado === "previsto" ? "opacity-60" : ""}
                  >
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {m.fecha}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={tipo.variant}>{tipo.label}</Badge>
                        {m.estado === "previsto" && (
                          <Badge variant={ESTADOS_MOVIMIENTO.previsto.variant}>
                            {ESTADOS_MOVIMIENTO.previsto.label}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{m.descripcion ?? m.categoria ?? "—"}</span>
                        {(m.proyecto_id || (m.descripcion && m.categoria)) && (
                          <span className="text-xs text-muted-foreground">
                            {[
                              m.descripcion && m.categoria ? m.categoria : null,
                              m.proyecto_id
                                ? nombreProyecto.get(m.proyecto_id)
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.socio_id
                        ? nombreSocio.get(m.socio_id) ?? "—"
                        : "Fondo común"}
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
                        proyectos={proyectos}
                        reparto={repartoPorMovimiento.get(m.id) ?? []}
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

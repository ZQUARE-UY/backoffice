import Link from "next/link"

import { BalanceSociosTabla } from "@/components/balance-socios-tabla"
import { EvolucionMensual } from "@/components/evolucion-mensual"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ESTADOS_PROYECTO,
  formatearUsd,
  type BalanceSocio,
  type EstadoProyecto,
  type Movimiento,
} from "@/lib/dominio"
import { createClient } from "@/lib/supabase/server"

export default async function InicioPage() {
  const supabase = await createClient()

  const [
    { data: userData },
    { data: movimientosData },
    { data: clientesData },
    { data: proyectosData },
    { data: balanceData },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("movimientos")
      .select("tipo, fecha, monto_usd, socio_id")
      .is("deleted_at", null),
    supabase.from("clientes").select("estado").is("deleted_at", null),
    supabase.from("proyectos").select("estado").is("deleted_at", null),
    supabase.from("balance_socios").select("*").order("nombre"),
  ])

  const user = userData.user
  const nombre =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "socio"

  const movimientos = (movimientosData ?? []) as Movimiento[]
  const clientes = (clientesData ?? []) as { estado: string }[]
  const proyectos = (proyectosData ?? []) as { estado: EstadoProyecto }[]
  const balance = (balanceData ?? []) as BalanceSocio[]

  const ingresos = movimientos
    .filter((m) => m.tipo === "ingreso")
    .reduce((acc, m) => acc + m.monto_usd, 0)
  const gastos = movimientos
    .filter((m) => m.tipo === "gasto")
    .reduce((acc, m) => acc + m.monto_usd, 0)
  const resultado = ingresos - gastos

  // Caja (fondo común): entra por ingresos, sale por gastos pagados con el
  // fondo (socio_id null). Los gastos que fronteó un socio no tocan la caja.
  const gastosFondo = movimientos
    .filter((m) => m.tipo === "gasto" && m.socio_id == null)
    .reduce((acc, m) => acc + m.monto_usd, 0)
  const caja = ingresos - gastosFondo

  const clientesActivos = clientes.filter((c) => c.estado === "activo").length
  const proyectosEnCurso = proyectos.filter(
    (p) => p.estado === "en_curso"
  ).length

  // Proyectos por estado, respetando el orden del catálogo y omitiendo los
  // estados sin proyectos.
  const porEstado = (Object.keys(ESTADOS_PROYECTO) as EstadoProyecto[])
    .map((estado) => ({
      estado,
      cantidad: proyectos.filter((p) => p.estado === estado).length,
    }))
    .filter((e) => e.cantidad > 0)

  const metricas = [
    {
      label: "Caja (fondo común)",
      valor: formatearUsd(caja),
      tono: caja < 0 ? "text-destructive" : "",
    },
    {
      label: "Ingresos",
      valor: formatearUsd(ingresos),
      tono: "text-emerald-600 dark:text-emerald-500",
    },
    { label: "Gastos", valor: formatearUsd(gastos), tono: "text-destructive" },
    { label: "Resultado", valor: formatearUsd(resultado), tono: "" },
    { label: "Clientes activos", valor: String(clientesActivos), tono: "" },
    { label: "Proyectos en curso", valor: String(proyectosEnCurso), tono: "" },
  ]

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Hola, {nombre}</h1>
        <p className="text-muted-foreground">
          Estado de la empresa de un vistazo.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {metricas.map((m) => (
          <Card key={m.label}>
            <CardHeader>
              <CardDescription>{m.label}</CardDescription>
              <CardTitle className={`text-2xl tabular-nums ${m.tono}`}>
                {m.valor}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <EvolucionMensual movimientos={movimientos} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Proyectos por estado</CardTitle>
            <CardDescription>
              Distribución de los proyectos cargados.
            </CardDescription>
          </CardHeader>
          <div className="flex flex-col gap-2 px-6 pb-6">
            {porEstado.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay proyectos cargados.{" "}
                <Link href="/clientes" className="text-primary hover:underline">
                  Ir a clientes
                </Link>
              </p>
            ) : (
              porEstado.map((e) => (
                <div
                  key={e.estado}
                  className="flex items-center justify-between"
                >
                  <Badge variant={ESTADOS_PROYECTO[e.estado].variant}>
                    {ESTADOS_PROYECTO[e.estado].label}
                  </Badge>
                  <span className="text-sm font-medium tabular-nums">
                    {e.cantidad}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <BalanceSociosTabla balance={balance} />
    </>
  )
}

import Link from "next/link"
import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon } from "lucide-react"

import { BalanceSociosTabla } from "@/components/balance-socios-tabla"
import { Encabezado } from "@/components/zq/encabezado"
import { formatearMonto, formatearUsd, type Movimiento } from "@/lib/dominio"
import { hoyUruguay, transferenciasSugeridas } from "@/lib/finanzas"
import { fechaCorta, iniciales } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { cargarFinanzas } from "./datos"
import { GraficoResultado } from "./grafico-resultado"
import { Liquidaciones } from "./liquidaciones"
import { NuevoMovimiento } from "./nuevo-movimiento"
import { Recurrentes } from "./recurrentes"

export const metadata = { title: "Finanzas" }

// Número con signo y sin moneda, para saldos y totales chicos ("+18,91").
function conSigno(v: number): string {
  const redondo = Math.round(v * 100) / 100
  if (redondo === 0) return "0"
  return `${redondo > 0 ? "+" : "−"}${Math.abs(redondo).toLocaleString("es-UY", { maximumFractionDigits: 2 })}`
}

export default async function FinanzasPage() {
  const { movimientos, socios, clientes, proyectos, balance, recurrentes, liquidaciones } = await cargarFinanzas()
  const hoy = hoyUruguay()
  const nombre = new Map(socios.map((s) => [s.id, s.nombre.split(" ")[0]]))
  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]))
  const nombreProyecto = new Map(proyectos.map((p) => [p.id, p.nombre]))

  // Los previstos son compromisos a futuro: no cuentan en el resultado ni en
  // la caja.
  const confirmados = movimientos.filter((m) => m.estado !== "previsto")
  const previstos = movimientos.filter((m) => m.estado === "previsto")
  const total = (lista: Movimiento[], tipo: Movimiento["tipo"], filtro: (m: Movimiento) => boolean = () => true) =>
    lista.filter((m) => m.tipo === tipo && filtro(m)).reduce((acc, m) => acc + Number(m.monto_usd), 0)

  const ingresos = total(confirmados, "ingreso")
  const gastos = total(confirmados, "gasto")
  const resultado = ingresos - gastos
  // Caja del fondo común: solo lo que pasó por la cuenta de la empresa. Lo
  // que un socio cobró o pagó de su bolsillo se salda entre socios.
  const enFondo = (m: Movimiento) => m.socio_id == null
  const caja = total(confirmados, "ingreso", enFondo) - total(confirmados, "gasto", enFondo)
  const comprometido = total(previstos, "ingreso") - total(previstos, "gasto")

  // Entre socios: el saldo de cada uno y cómo dejarlo en cero.
  const sugeridas = transferenciasSugeridas(balance)
  const receptores = new Set(sugeridas.map((t) => t.para_socio_id))
  const montos = new Set(sugeridas.map((t) => Math.round(t.monto_usd * 100)))
  const sugerencia =
    sugeridas.length === 0
      ? "Están a mano: nadie le debe a nadie."
      : receptores.size === 1 && montos.size === 1 && sugeridas.length > 1
        ? `${nombre.get(sugeridas[0].para_socio_id)} recibe ${formatearUsd(sugeridas[0].monto_usd)} de cada uno y quedan en cero.`
        : "Con estas transferencias quedan en cero."

  const ultimos = movimientos.slice(0, 5)

  return (
    <>
      <Encabezado
        titulo="Finanzas"
        acciones={
          <>
            <NuevoMovimiento
              socios={socios}
              clientes={clientes}
              proyectos={proyectos}
              tipoInicial="ingreso"
              variante="outline"
              etiqueta={
                <>
                  <span className="font-bold text-positivo">+</span> Ingreso
                </>
              }
            />
            <NuevoMovimiento
              socios={socios}
              clientes={clientes}
              proyectos={proyectos}
              tipoInicial="gasto"
              variante="outline"
              escucharCrear
              etiqueta={
                <>
                  <span className="font-bold text-negativo">−</span> Gasto
                </>
              }
            />
            <NuevoMovimiento
              socios={socios}
              clientes={clientes}
              proyectos={proyectos}
              tipoInicial="transferencia"
              variante="outline"
              etiqueta="⇄ Transferencia"
            />
          </>
        }
      />

      <section aria-label="Resultado" className="flex flex-wrap items-end gap-x-10 gap-y-6 rounded-xl border bg-card px-7 py-6">
        <div className="flex flex-[0_1_280px] flex-col gap-3.5">
          <div>
            <p className="m-0 text-[13px] text-muted-foreground">Resultado acumulado</p>
            <p className={cn("zq-num m-0 font-display text-[44px] leading-[50px]", resultado < 0 && "text-negativo")}>
              {formatearUsd(resultado)}
            </p>
          </div>
          <div className="zq-num flex gap-6">
            <div>
              <p className="m-0 text-xs text-muted-foreground">Entró</p>
              <p className="m-0 font-semibold text-positivo">{conSigno(ingresos)}</p>
            </div>
            <div>
              <p className="m-0 text-xs text-muted-foreground">Salió</p>
              <p className="m-0 font-semibold text-negativo">{conSigno(-gastos)}</p>
            </div>
            <div>
              <p className="m-0 text-xs text-muted-foreground">En caja</p>
              <p className={cn("m-0 font-semibold", caja < 0 && "text-negativo")}>{caja.toLocaleString("es-UY", { maximumFractionDigits: 2 })}</p>
            </div>
          </div>
          {previstos.length > 0 && (
            <p className="zq-num m-0 text-xs text-muted-foreground">
              Previsto a futuro: {conSigno(comprometido)} USD
            </p>
          )}
        </div>
        <GraficoResultado movimientos={confirmados} hoy={hoy} />
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <section aria-labelledby="socios" className="flex min-w-0 flex-[1_1_340px] flex-col gap-4 rounded-xl border bg-card px-6 py-5">
          <h2 id="socios" className="m-0 text-base font-semibold">
            Entre socios
          </h2>
          <ul className="zq-num m-0 grid list-none grid-cols-4 gap-2 p-0">
            {balance.map((b) => {
              const aFavor = Math.round(b.saldo_usd * 100) > 0
              const enContra = Math.round(b.saldo_usd * 100) < 0
              return (
                <li key={b.socio_id} className="flex flex-col items-center gap-1.5 text-center">
                  <span
                    className={cn(
                      "inline-flex size-10 items-center justify-center rounded-full text-[13px] font-bold",
                      aFavor ? "bg-lima text-carbon" : "bg-muted text-foreground"
                    )}
                  >
                    {iniciales(b.nombre)}
                  </span>
                  <span className="text-[13px]">{b.nombre.split(" ")[0]}</span>
                  <span
                    className={cn(
                      "text-[13px] font-semibold",
                      aFavor ? "text-positivo" : enContra ? "text-negativo" : "text-muted-foreground"
                    )}
                    aria-label={aFavor ? `a favor ${conSigno(b.saldo_usd)}` : enContra ? `debe ${conSigno(b.saldo_usd)}` : "a mano"}
                  >
                    {conSigno(b.saldo_usd)}
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-col gap-2 rounded-[10px] bg-muted px-3.5 py-3">
            <span>{sugerencia}</span>
            {sugeridas.map((t, i) => (
              <div key={`${t.de_socio_id}-${t.para_socio_id}`} className="flex items-center justify-between gap-3">
                <span className="zq-num flex items-center gap-1.5 text-[13px]">
                  {nombre.get(t.de_socio_id)}
                  <ArrowRightIcon className="size-3.5 text-muted-foreground" aria-label="le pasa a" />
                  {nombre.get(t.para_socio_id)} · {formatearUsd(t.monto_usd)}
                </span>
                <NuevoMovimiento
                  socios={socios}
                  clientes={clientes}
                  proyectos={proyectos}
                  transferencia={{ de: t.de_socio_id, para: t.para_socio_id, monto: t.monto_usd }}
                  etiqueta="Registrar"
                  variante={i === 0 ? "default" : "outline"}
                  tamano="sm"
                />
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="ultimos" className="flex min-w-0 flex-[1.4_1_420px] flex-col rounded-xl border bg-card px-6 pt-5 pb-3">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id="ultimos" className="m-0 text-base font-semibold">
              Últimos movimientos
            </h2>
            <Link href="/finanzas/movimientos" className="text-sm font-semibold">
              Ver todos →
            </Link>
          </div>
          {ultimos.length === 0 ? (
            <p className="m-0 border-t py-4 text-muted-foreground">Todavía no hay movimientos. Cargá el primero con + Ingreso o − Gasto.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {ultimos.map((m) => {
                const ingreso = m.tipo === "ingreso"
                const extra = m.proyecto_id
                  ? nombreProyecto.get(m.proyecto_id)
                  : m.cliente_id
                    ? nombreCliente.get(m.cliente_id)
                    : null
                return (
                  <li key={m.id} className={cn("flex items-center gap-3.5 border-t py-2.5", m.estado === "previsto" && "opacity-60")}>
                    <span
                      aria-label={ingreso ? "Ingreso" : "Gasto"}
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full",
                        ingreso ? "bg-lima text-carbon" : "bg-muted text-foreground"
                      )}
                    >
                      {ingreso ? <ArrowUpIcon className="size-4" /> : <ArrowDownIcon className="size-4" />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">
                        {m.descripcion ?? m.categoria ?? "Sin descripción"}
                        {extra && ` · ${extra}`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {m.socio_id ? nombre.get(m.socio_id) : "Fondo común"} · {fechaCorta(m.fecha, hoy)}
                        {m.estado === "previsto" && " · previsto"}
                      </span>
                    </span>
                    <span className={cn("zq-num font-semibold whitespace-nowrap", ingreso && "text-positivo")}>
                      {ingreso ? "+" : "−"}
                      {formatearMonto(Number(m.monto), m.moneda)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <details className="rounded-xl border bg-card px-6 py-4">
        <summary className="cursor-pointer font-semibold select-none">
          Recurrentes, transferencias hechas y balance detallado
        </summary>
        <div className="flex flex-col gap-5 pt-4">
          <Recurrentes recurrentes={recurrentes} hoy={hoy} socios={socios} clientes={clientes} proyectos={proyectos} />
          <Liquidaciones balance={balance} socios={socios} liquidaciones={liquidaciones} hoy={hoy} />
          <BalanceSociosTabla balance={balance} />
        </div>
      </details>
    </>
  )
}

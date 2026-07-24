import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatearUsd, type Movimiento } from "@/lib/dominio"

// Evolución de ingresos vs. gastos (consolidado en USD) de los últimos 6 meses.
// Barras en CSS puro: alto proporcional al máximo del período. Sin librerías.
export function EvolucionMensual({
  movimientos,
  meses = 6,
}: {
  movimientos: Movimiento[]
  meses?: number
}) {
  const ahora = new Date()
  const buckets = Array.from({ length: meses }, (_, i) => {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - (meses - 1 - i), 1)
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const label = d.toLocaleDateString("es-UY", { month: "short" })
    return { clave, label, ingresos: 0, gastos: 0 }
  })
  const indice = new Map(buckets.map((b, i) => [b.clave, i]))

  for (const m of movimientos) {
    const i = indice.get(m.fecha.slice(0, 7))
    if (i == null) continue
    if (m.tipo === "ingreso") buckets[i].ingresos += m.monto_usd
    else if (m.tipo === "gasto") buckets[i].gastos += m.monto_usd
  }

  const maximo = Math.max(
    1,
    ...buckets.map((b) => Math.max(b.ingresos, b.gastos))
  )
  const hayDatos = buckets.some((b) => b.ingresos > 0 || b.gastos > 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Evolución mensual</CardTitle>
            <CardDescription>
              Ingresos vs. gastos de los últimos {meses} meses, en USD.
            </CardDescription>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-emerald-500" />
              Ingresos
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-destructive" />
              Gastos
            </span>
          </div>
        </div>
      </CardHeader>
      <div className="px-6 pb-6">
        {hayDatos ? (
          <div className="flex h-40 items-end gap-3">
            {buckets.map((b) => (
              <div
                key={b.clave}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <div className="flex h-32 w-full items-end justify-center gap-1">
                  <div
                    className="w-1/2 rounded-t bg-emerald-500 transition-all"
                    style={{ height: `${(b.ingresos / maximo) * 100}%` }}
                    title={`Ingresos: ${formatearUsd(b.ingresos)}`}
                  />
                  <div
                    className="w-1/2 rounded-t bg-destructive transition-all"
                    style={{ height: `${(b.gastos / maximo) * 100}%` }}
                    title={`Gastos: ${formatearUsd(b.gastos)}`}
                  />
                </div>
                <span className="text-xs text-muted-foreground capitalize">
                  {b.label}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Todavía no hay ingresos ni gastos cargados para graficar.
          </p>
        )}
      </div>
    </Card>
  )
}

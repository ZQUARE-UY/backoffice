import { formatearNumero } from "@/lib/formato"

const MESES = ["Ene.", "Feb.", "Mar.", "Abr.", "May.", "Jun.", "Jul.", "Ago.", "Set.", "Oct.", "Nov.", "Dic."]

// Resultado acumulado mes a mes (área en lima, línea en tinta), de los
// últimos `meses` meses. El acumulado arranca en el primer movimiento, así
// que el primer punto ya trae lo de antes. SVG a mano: es un solo gráfico y
// no justifica una librería.
export function GraficoResultado({
  movimientos,
  hoy,
  meses = 6,
}: {
  // Solo confirmados, consolidados en USD.
  movimientos: { fecha: string; tipo: string; monto_usd: number }[]
  hoy: string // YYYY-MM-DD
  meses?: number
}) {
  const netoPorMes = new Map<string, number>()
  for (const m of movimientos) {
    const mes = m.fecha.slice(0, 7)
    const signo = m.tipo === "ingreso" ? 1 : m.tipo === "gasto" ? -1 : 0
    netoPorMes.set(mes, (netoPorMes.get(mes) ?? 0) + signo * Number(m.monto_usd))
  }

  // Los últimos `meses` meses hasta el actual, y lo acumulado antes.
  const [a, m] = hoy.split("-").map(Number)
  const lista: string[] = []
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1))
    lista.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`)
  }
  let acumulado = 0
  for (const [mes, neto] of netoPorMes) if (mes < lista[0]) acumulado += neto
  const valores = lista.map((mes) => (acumulado += netoPorMes.get(mes) ?? 0))

  const W = 640
  const H = 150
  const arriba = 14
  const abajo = 28
  const min = Math.min(0, ...valores)
  const max = Math.max(0, ...valores)
  const rango = max - min || 1
  const x = (i: number) => 20 + (i * (W - 40)) / (lista.length - 1)
  const y = (v: number) => arriba + ((max - v) / rango) * (H - arriba - abajo)
  const puntos = valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const cero = y(0)
  const area = `M${x(0).toFixed(1)},${cero.toFixed(1)} L${puntos.join(" L")} L${x(lista.length - 1).toFixed(1)},${cero.toFixed(1)} Z`

  const etiqueta = lista
    .map((mes, i) => `${MESES[Number(mes.slice(5)) - 1]} ${formatearNumero(valores[i])}`)
    .join(", ")

  return (
    <figure className="m-0 min-w-0 flex-[1_1_420px]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="160"
        role="img"
        aria-label={`Resultado acumulado por mes, en dólares: ${etiqueta}`}
        className="block overflow-visible"
      >
        <line x1="20" y1={cero} x2={W - 20} y2={cero} className="stroke-input" strokeWidth="1" strokeDasharray="4 4" />
        <path d={area} className="fill-lima" opacity="0.55" />
        <polyline points={puntos.join(" ")} fill="none" className="stroke-foreground" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx={x(lista.length - 1)} cy={y(valores.at(-1) ?? 0)} r="5" className="fill-foreground" />
        {lista.map((mes, i) => (
          <text
            key={mes}
            x={x(i)}
            y={H - 4}
            textAnchor="middle"
            className={i === lista.length - 1 ? "fill-foreground font-semibold" : "fill-muted-foreground"}
            fontSize="12"
          >
            {MESES[Number(mes.slice(5)) - 1]}
          </text>
        ))}
      </svg>
    </figure>
  )
}

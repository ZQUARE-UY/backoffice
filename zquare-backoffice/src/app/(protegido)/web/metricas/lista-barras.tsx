import { formatearNumero } from "@/lib/formato"

export type Fila = { clave: string; n: number }

// Desglose como lista: nombre, número y una barra horizontal proporcional
// (el número va en texto, la barra solo acompaña). Con `total`, la barra y el
// porcentaje son sobre ese total; si no, sobre la fila más alta.
export function ListaBarras({
  titulo,
  filas,
  total,
  nota,
  unidad,
  vacio = "Sin datos en este período.",
  ordenar = true,
}: {
  titulo: string
  filas: Fila[]
  total?: number
  nota?: string
  unidad?: string
  vacio?: string
  ordenar?: boolean
}) {
  const lista = ordenar ? [...filas].sort((a, b) => b.n - a.n) : filas
  const base = total ?? Math.max(1, ...lista.map((f) => f.n))

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="zq-rotulo text-[13px]">{titulo}</h2>
        {nota && <p className="m-0 text-xs text-muted-foreground">{nota}</p>}
      </div>
      {lista.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">{vacio}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {lista.map((f) => {
            const parte = base ? Math.min(1, f.n / base) : 0
            return (
              <li key={f.clave} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{f.clave}</span>
                  <span className="zq-num shrink-0 text-muted-foreground">
                    <span className="font-semibold text-foreground">{formatearNumero(f.n)}</span>
                    {total ? ` · ${formatearNumero(parte * 100)}%` : unidad ? ` ${unidad}` : ""}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted" aria-hidden="true">
                  <div className="h-full rounded-full bg-lima" style={{ width: `${Math.max(parte * 100, f.n > 0 ? 2 : 0)}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

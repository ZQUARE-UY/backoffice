"use client"

import { useState } from "react"

import { fechaCorta } from "@/lib/formato"

export type PuntoDia = { dia: string; visitantes: number; vistas: number }

// Visitantes por día en columnas (una serie, sin leyenda: el título la
// nombra). SVG a mano como el de Finanzas. Al pasar el mouse (o con el foco
// del teclado) la columna se marca y arriba se ve el detalle del día.
export function GraficoDias({ puntos, hoy }: { puntos: PuntoDia[]; hoy: string }) {
  const [activo, setActivo] = useState<number | null>(null)

  const W = 720
  const H = 180
  const arriba = 12
  const abajo = 24
  const max = Math.max(1, ...puntos.map((p) => p.visitantes))
  const paso = W / puntos.length
  const ancho = Math.min(24, Math.max(2, paso - 2))
  const y = (v: number) => arriba + (1 - v / max) * (H - arriba - abajo)
  const base = H - abajo
  const marcas = [0, Math.floor((puntos.length - 1) / 2), puntos.length - 1]

  const detalle = activo !== null ? puntos[activo] : null
  const total = puntos.reduce((s, p) => s + p.visitantes, 0)

  return (
    <figure className="m-0 flex flex-col gap-2">
      <p className="m-0 min-h-5 text-sm text-muted-foreground" aria-live="polite">
        {detalle ? (
          <>
            <span className="font-semibold text-foreground">{fechaCorta(detalle.dia, hoy)}</span> ·{" "}
            {detalle.visitantes} {detalle.visitantes === 1 ? "visitante" : "visitantes"} · {detalle.vistas}{" "}
            {detalle.vistas === 1 ? "página vista" : "páginas vistas"}
          </>
        ) : (
          <>Máximo {max} por día · pasá el mouse por una columna para ver el día</>
        )}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`Visitantes por día: ${total} en ${puntos.length} días, máximo ${max} en un día`}
        className="block overflow-visible"
        onMouseLeave={() => setActivo(null)}
      >
        <line x1="0" y1={base} x2={W} y2={base} className="stroke-input" strokeWidth="1" />
        {puntos.map((p, i) => {
          const x = i * paso + (paso - ancho) / 2
          const alto = base - y(p.visitantes)
          const r = Math.min(4, ancho / 2, alto)
          return (
            <g
              key={p.dia}
              tabIndex={0}
              aria-label={`${fechaCorta(p.dia, hoy)}: ${p.visitantes} visitantes`}
              onMouseEnter={() => setActivo(i)}
              onFocus={() => setActivo(i)}
              onBlur={() => setActivo(null)}
              className="outline-none"
            >
              {/* Zona de hover de toda la franja del día, más grande que la columna. */}
              <rect x={i * paso} y={arriba} width={paso} height={base - arriba} fill="transparent" />
              {alto > 0 && (
                <path
                  d={`M${x},${base} V${base - alto + r} Q${x},${base - alto} ${x + r},${base - alto} H${x + ancho - r} Q${x + ancho},${base - alto} ${x + ancho},${base - alto + r} V${base} Z`}
                  className={activo === i ? "fill-lima" : "fill-foreground"}
                  opacity={activo === null || activo === i ? 1 : 0.55}
                />
              )}
            </g>
          )
        })}
        {[...new Set(marcas)].map((i) => (
          <text
            key={i}
            x={i === 0 ? 0 : i === puntos.length - 1 ? W : i * paso + paso / 2}
            y={H - 4}
            textAnchor={i === 0 ? "start" : i === puntos.length - 1 ? "end" : "middle"}
            className="fill-muted-foreground"
            fontSize="12"
          >
            {fechaCorta(puntos[i].dia, hoy)}
          </text>
        ))}
      </svg>
    </figure>
  )
}

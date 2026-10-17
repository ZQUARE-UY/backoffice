import { formatearNumero } from "@/lib/formato"
import { resumenGoogleAnalytics } from "@/lib/google-analytics"

import { ListaBarras } from "./lista-barras"

function duracion(segundos: number): string {
  const s = Math.round(segundos)
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`
}

// Bloque de Google Analytics en Web → Métricas. Va en su propio Suspense:
// la API de Google tarda y no tiene que frenar las métricas propias.
export async function BloqueGoogleAnalytics({ desde, hasta }: { desde: string; hasta: string }) {
  const r = await resumenGoogleAnalytics(desde, hasta)

  return (
    <section aria-label="Google Analytics" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2 border-t pt-6">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-lg font-semibold tracking-tight">Google Analytics</h2>
          <p className="m-0 text-sm text-muted-foreground">
            Solo cuenta a quienes aceptaron las cookies, por eso da menos que las métricas de arriba. Llega con unas horas
            de demora.
          </p>
        </div>
        <a href="https://analytics.google.com" target="_blank" rel="noreferrer" className="text-sm text-foreground">
          Abrir Google Analytics ↗
        </a>
      </div>

      {!r.ok ? (
        <p className="m-0 rounded-xl border border-dashed border-input p-5 text-muted-foreground">{r.error}</p>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
            {[
              { rotulo: "Usuarios", valor: formatearNumero(r.datos.usuarios), nota: `${formatearNumero(r.datos.nuevos)} nuevos` },
              { rotulo: "Sesiones", valor: formatearNumero(r.datos.sesiones), nota: null },
              { rotulo: "Tiempo por sesión", valor: duracion(r.datos.duracionMedia), nota: "interacción promedio" },
              {
                rotulo: "Interacción",
                valor: `${formatearNumero(r.datos.interaccion * 100)}%`,
                nota: "sesiones con interacción",
              },
            ].map((c) => (
              <div key={c.rotulo} className="rounded-xl border bg-card px-4 pt-4 pb-[18px]">
                <p className="m-0 mb-1.5 text-[13px] text-muted-foreground">{c.rotulo}</p>
                <p className="zq-num m-0 text-2xl leading-[30px] font-semibold tracking-[-0.01em]">{c.valor}</p>
                {c.nota && <p className="m-0 mt-1 text-xs text-muted-foreground">{c.nota}</p>}
              </div>
            ))}
          </div>
          {r.datos.sesiones > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              <ListaBarras titulo="Fuente / medio" filas={r.datos.fuentes} unidad="sesiones" nota="Cómo llegaron, según Google" />
              <ListaBarras titulo="Ciudades" filas={r.datos.ciudades} unidad="usuarios" />
            </div>
          )}
        </>
      )}
    </section>
  )
}

export function BloqueGoogleAnalyticsCargando() {
  return (
    <section aria-label="Google Analytics" className="flex flex-col gap-3 border-t pt-6">
      <h2 className="m-0 text-lg font-semibold tracking-tight">Google Analytics</h2>
      <p className="m-0 text-sm text-muted-foreground">Trayendo los datos de Google…</p>
    </section>
  )
}

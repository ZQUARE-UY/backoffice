import Link from "next/link"

import { Encabezado } from "@/components/zq/encabezado"
import { formatearNumero } from "@/lib/formato"

import { GraficoDias, type PuntoDia } from "./grafico-dias"
import { ListaBarras, type Fila } from "./lista-barras"

export type Resumen = {
  visitantes: number
  vistas: number
  leads: number
  clicks_email: number
  por_dia: PuntoDia[]
  origenes: Fila[]
  paises: Fila[]
  dispositivos: Fila[]
  idiomas: Fila[]
  secciones: Fila[]
  scroll: Fila[]
  ctas: Fila[]
}

export const RANGOS = [7, 30, 90] as const

// Secciones de zquare.uy en el orden de la página (ids de las <section>).
const SECCIONES: [string, string][] = [
  ["servicios", "Servicios"],
  ["metodo", "Método"],
  ["equipo", "Equipo"],
  ["testimonios", "Testimonios"],
  ["contacto", "Contacto"],
]

const DISPOSITIVOS: Record<string, string> = { movil: "Celular", tablet: "Tablet", escritorio: "Computadora" }
const IDIOMAS: Record<string, string> = { es: "Español", en: "Inglés" }
const paises = new Intl.DisplayNames(["es"], { type: "region" })

function nombrePais(codigo: string): string {
  try {
    return codigo.length === 2 ? (paises.of(codigo) ?? codigo) : codigo
  } catch {
    return codigo
  }
}

// YYYY-MM-DD sumando días (en UTC, sin husos de por medio).
export function sumarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number)
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10)
}

// Vista de la pestaña Métricas (los datos los trae page.tsx).
export function VistaMetricas({
  dias,
  hoy,
  resumen: r,
  consultas,
  error,
}: {
  dias: number
  hoy: string
  resumen: Resumen | null
  consultas: number
  error: string | null
}) {
  const primerDia = sumarDias(hoy, -(dias - 1))
  // Todos los días del rango, con cero los que no tuvieron visitas.
  const porDia = new Map((r?.por_dia ?? []).map((p) => [p.dia, p]))
  const puntos: PuntoDia[] = Array.from({ length: dias }, (_, i) => {
    const dia = sumarDias(primerDia, i)
    return porDia.get(dia) ?? { dia, visitantes: 0, vistas: 0 }
  })

  const visitantes = r?.visitantes ?? 0
  const nConsultas = consultas
  const pct = (n: number) => (visitantes ? `${formatearNumero((n / visitantes) * 100, n / visitantes < 0.1 ? 1 : 0)}%` : "—")
  const cifras = [
    { rotulo: "Visitantes", valor: formatearNumero(visitantes), nota: "únicos por día" },
    { rotulo: "Páginas vistas", valor: formatearNumero(r?.vistas ?? 0), nota: null },
    { rotulo: "Consultas", valor: formatearNumero(nConsultas), nota: "por el formulario, sin descartadas" },
    { rotulo: "Conversión", valor: pct(nConsultas), nota: "consultas / visitantes" },
  ]

  const porClave = (filas: Fila[] | undefined) => new Map((filas ?? []).map((f) => [f.clave, f.n]))
  const vistasSeccion = porClave(r?.secciones)
  const vistasScroll = porClave(r?.scroll)

  return (
    <>
      <Encabezado titulo="Métricas" rotulo="Web · zquare.uy" />

      <nav className="zq-pildoras self-start" aria-label="Período">
        {RANGOS.map((n) => (
          <Link
            key={n}
            href={n === 30 ? "/web/metricas" : `/web/metricas?dias=${n}`}
            scroll={false}
            aria-current={n === dias ? "page" : undefined}
          >
            Últimos {n} días
          </Link>
        ))}
      </nav>

      {error ? (
        <p className="m-0 rounded-xl border border-dashed border-input p-8 text-center text-muted-foreground">
          No se pudieron cargar las métricas ({error}).
        </p>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
            {cifras.map((c) => (
              <div key={c.rotulo} className="rounded-xl border bg-card px-4 pt-4 pb-[18px]">
                <p className="m-0 mb-1.5 text-[13px] text-muted-foreground">{c.rotulo}</p>
                <p className="zq-num m-0 text-2xl leading-[30px] font-semibold tracking-[-0.01em]">{c.valor}</p>
                {c.nota && <p className="m-0 mt-1 text-xs text-muted-foreground">{c.nota}</p>}
              </div>
            ))}
          </div>

          <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
            <h2 className="zq-rotulo text-[13px]">Visitantes por día</h2>
            {visitantes === 0 ? (
              <p className="m-0 text-muted-foreground">
                Todavía no hay visitas registradas en este período. Se cuentan desde que la web empezó a mandar
                sus métricas al backoffice.
              </p>
            ) : (
              <GraficoDias puntos={puntos} hoy={hoy} />
            )}
          </section>

          {visitantes > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              <ListaBarras
                titulo="De dónde llegan"
                filas={r?.origenes ?? []}
                total={visitantes}
                nota="Campaña (utm_source) o sitio que los mandó"
              />
              <ListaBarras
                titulo="Recorrido por la página"
                filas={SECCIONES.map(([id, nombre]) => ({ clave: nombre, n: vistasSeccion.get(id) ?? 0 }))}
                total={visitantes}
                nota="Visitantes que llegaron a cada sección"
                ordenar={false}
              />
              <ListaBarras
                titulo="Hasta dónde bajan"
                filas={["25", "50", "75", "90"].map((p) => ({ clave: `${p}% de la página`, n: vistasScroll.get(p) ?? 0 }))}
                total={visitantes}
                ordenar={false}
              />
              <ListaBarras
                titulo="Botones que tocan"
                filas={[
                  ...(r?.ctas ?? []),
                  ...((r?.clicks_email ?? 0) > 0 ? [{ clave: "Mail (hola@zquare.uy)", n: r?.clicks_email ?? 0 }] : []),
                ]}
                unidad="clicks"
                vacio="Nadie tocó un botón todavía."
              />
              <ListaBarras
                titulo="Países"
                filas={(r?.paises ?? []).map((f) => ({ ...f, clave: nombrePais(f.clave) }))}
                total={visitantes}
              />
              <ListaBarras
                titulo="Dispositivo e idioma"
                filas={[
                  ...(r?.dispositivos ?? []).map((f) => ({ ...f, clave: DISPOSITIVOS[f.clave] ?? f.clave })),
                  ...(r?.idiomas ?? []).map((f) => ({ ...f, clave: `En ${(IDIOMAS[f.clave] ?? f.clave).toLowerCase()}` })),
                ]}
                total={visitantes}
                ordenar={false}
              />
            </div>
          )}
        </>
      )}
    </>
  )
}

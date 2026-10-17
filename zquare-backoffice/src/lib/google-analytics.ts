import "server-only"

import { google } from "googleapis"

import { clienteJwt, googleConfigurado } from "@/lib/google"

// Google Analytics de zquare.uy, leído con la cuenta de servicio del
// backoffice (la de Drive), que tiene rol Lector en la propiedad. Usa la
// Google Analytics Data API. Solo cuenta a quien aceptó las cookies de la web,
// así que da menos que las métricas propias.
export const GA_PROPIEDAD = "559359658"

export type FilaGA = { clave: string; n: number }
export type ResumenGA = {
  usuarios: number
  nuevos: number
  sesiones: number
  // Segundos promedio de interacción por sesión.
  duracionMedia: number
  // 0 a 1.
  interaccion: number
  fuentes: FilaGA[]
  ciudades: FilaGA[]
}

type Resultado = { ok: true; datos: ResumenGA } | { ok: false; error: string }

function filas(reporte: { rows?: { dimensionValues?: { value?: string | null }[]; metricValues?: { value?: string | null }[] }[] | null } | undefined): FilaGA[] {
  return (reporte?.rows ?? []).map((r) => ({
    clave: r.dimensionValues?.[0]?.value || "—",
    n: Number(r.metricValues?.[0]?.value ?? 0),
  }))
}

// Desde y hasta en YYYY-MM-DD (la propiedad está en hora de Montevideo).
export async function resumenGoogleAnalytics(desde: string, hasta: string): Promise<Resultado> {
  if (!googleConfigurado()) return { ok: false, error: "El backoffice no tiene configurada la cuenta de servicio de Google." }
  try {
    const api = google.analyticsdata({
      version: "v1beta",
      auth: clienteJwt(["https://www.googleapis.com/auth/analytics.readonly"]),
    })
    const dateRanges = [{ startDate: desde, endDate: hasta }]
    const { data } = await api.properties.batchRunReports({
      property: `properties/${GA_PROPIEDAD}`,
      requestBody: {
        requests: [
          {
            dateRanges,
            metrics: [
              { name: "activeUsers" },
              { name: "newUsers" },
              { name: "sessions" },
              { name: "averageSessionDuration" },
              { name: "engagementRate" },
            ],
          },
          {
            dateRanges,
            dimensions: [{ name: "sessionSourceMedium" }],
            metrics: [{ name: "sessions" }],
            orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
            limit: "6",
          },
          {
            dateRanges,
            dimensions: [{ name: "city" }],
            metrics: [{ name: "activeUsers" }],
            orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
            limit: "6",
          },
        ],
      },
    })
    const [totales, fuentes, ciudades] = data.reports ?? []
    const m = totales?.rows?.[0]?.metricValues ?? []
    const num = (i: number) => Number(m[i]?.value ?? 0)
    return {
      ok: true,
      datos: {
        usuarios: num(0),
        nuevos: num(1),
        sesiones: num(2),
        duracionMedia: num(3),
        interaccion: num(4),
        fuentes: filas(fuentes),
        ciudades: filas(ciudades).map((f) => ({ ...f, clave: f.clave === "(not set)" ? "Sin dato" : f.clave })),
      },
    }
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e)
    console.error("Google Analytics:", mensaje)
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(mensaje)) {
      return { ok: false, error: "Falta habilitar la Google Analytics Data API en el proyecto de Google Cloud de la cuenta de servicio." }
    }
    if (/permission|PERMISSION_DENIED|403/i.test(mensaje)) {
      return { ok: false, error: "La cuenta de servicio del backoffice no tiene acceso a la propiedad: agregala como Lector en Administrar → Acceso a la propiedad." }
    }
    return { ok: false, error: `No se pudieron traer los datos de Google Analytics (${mensaje.slice(0, 120)}).` }
  }
}

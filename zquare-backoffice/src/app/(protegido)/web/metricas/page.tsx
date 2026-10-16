import { hoyUruguay } from "@/lib/finanzas"
import { createClient } from "@/lib/supabase/server"

import { RANGOS, sumarDias, VistaMetricas, type Resumen } from "./vista-metricas"

export const metadata = { title: "Métricas · Web" }

// Métricas propias de zquare.uy: lo que manda la web a /api/publico/eventos,
// resumido por la función metricas_web de la base. Las consultas salen de
// la bandeja (consultas_web), que es el dato real.
export default async function MetricasWebPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>
}) {
  const { dias: diasParam } = await searchParams
  const dias = RANGOS.find((r) => String(r) === diasParam) ?? 30
  const hoy = hoyUruguay()
  const primerDia = sumarDias(hoy, -(dias - 1))
  // Medianoche de Montevideo (UTC-3, sin horario de verano desde 2015).
  const desde = new Date(`${primerDia}T00:00:00-03:00`).toISOString()
  const hasta = new Date(`${sumarDias(hoy, 1)}T00:00:00-03:00`).toISOString()

  const supabase = await createClient()
  const [{ data, error }, { count: consultas }] = await Promise.all([
    supabase.rpc("metricas_web", { desde, hasta }),
    supabase
      .from("consultas_web")
      .select("id", { count: "exact", head: true })
      .gte("created_at", desde)
      .lt("created_at", hasta)
      .is("deleted_at", null),
  ])

  return (
    <VistaMetricas
      dias={dias}
      hoy={hoy}
      resumen={data as Resumen | null}
      consultas={consultas ?? 0}
      error={error?.message ?? null}
    />
  )
}


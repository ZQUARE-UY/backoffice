import "server-only"

import { hoyUruguay } from "@/lib/finanzas"
import { createClient } from "@/lib/supabase/server"

// Resumen del gasto en APIs (uso_api) para Inicio: este mes, el anterior y
// una proyección lineal a fin de mes. Los meses son de Montevideo (UTC−3).

export function inicioDelMes(desplazamiento = 0): string {
  const [a, m] = hoyUruguay().split("-").map(Number)
  const fecha = new Date(Date.UTC(a, m - 1 + desplazamiento, 1))
  return `${fecha.toISOString().slice(0, 10)}T00:00:00-03:00`
}

export type ResumenUsoApi = {
  mes: number
  mesAnterior: number
  proyeccion: number
  llamadas: number
  porFuncion: { funcion: string; usd: number }[]
}

export async function resumenUsoApi(): Promise<ResumenUsoApi> {
  const supabase = await createClient()
  const { data } = await supabase.rpc("uso_api_por_mes", { desde: inicioDelMes(-1) })
  const filas = (data ?? []) as { mes: string; funcion: string; llamadas: number; costo_usd: number }[]
  const actual = inicioDelMes().slice(0, 10)
  const delMes = filas.filter((f) => f.mes === actual)
  const mes = delMes.reduce((s, f) => s + Number(f.costo_usd), 0)

  const hoy = hoyUruguay()
  const [a, m, d] = hoy.split("-").map(Number)
  const diasDelMes = new Date(Date.UTC(a, m, 0)).getUTCDate()

  return {
    mes,
    mesAnterior: filas.filter((f) => f.mes !== actual).reduce((s, f) => s + Number(f.costo_usd), 0),
    proyeccion: (mes / d) * diasDelMes,
    llamadas: delMes.reduce((s, f) => s + Number(f.llamadas), 0),
    porFuncion: delMes.map((f) => ({ funcion: f.funcion, usd: Number(f.costo_usd) })).sort((x, y) => y.usd - x.usd),
  }
}

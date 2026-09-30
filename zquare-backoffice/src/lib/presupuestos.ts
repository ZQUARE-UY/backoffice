import type { SupabaseClient } from "@supabase/supabase-js"

// Cálculos de un presupuesto compartidos entre la UI y el MCP. Viven acá y no
// en las server actions para que el editor, la ficha y `listar_presupuestos`
// den los mismos números.

export type ItemCalculable = {
  horas: number | null
  tarifa: number | null
  horas_internas?: number | null
}

// Subtotal por ítem: si tiene horas, es horas × tarifa; si no, la tarifa es
// el precio directo del ítem (precio cerrado).
export function calcularSubtotal(item: ItemCalculable): number {
  const tarifa = Number.isFinite(item.tarifa) ? Number(item.tarifa) : 0
  if (item.horas != null && Number.isFinite(item.horas)) {
    return Math.round(item.horas * tarifa * 100) / 100
  }
  return Math.round(tarifa * 100) / 100
}

// Horas que estimamos para un ítem: las internas si están; si no, las que se
// cobran. Un ítem a precio cerrado sin horas internas no suma nada.
export function horasEstimadasItem(item: ItemCalculable): number {
  if (item.horas_internas != null) return Number(item.horas_internas)
  if (item.horas != null) return Number(item.horas)
  return 0
}

export function horasEstimadas(items: ItemCalculable[]): number {
  return items.reduce((acc, it) => acc + horasEstimadasItem(it), 0)
}

// Precio ÷ horas estimadas: lo que de verdad cobramos por hora en este
// presupuesto, sea cual sea la forma en que se le presentó al cliente.
export function tarifaImplicita(total: number, horas: number): number | null {
  if (!horas || horas <= 0) return null
  return Math.round((total / horas) * 100) / 100
}

export function codigoPresupuesto(numero: number): string {
  return `PRES-${numero}`
}

// "PRES-7", "pres7" o 7 → 7.
export function numeroDePresupuesto(referencia: string | number): number | null {
  const n = Number(String(referencia).replace(/^pres-?/i, "").trim())
  return Number.isInteger(n) && n > 0 ? n : null
}

export const CLAVE_TARIFA = "tarifa_hora_usd"

// Tarifa por hora de referencia (configuracion.tarifa_hora_usd). Null si
// todavía no se aplicó la migración o alguien borró la fila: los llamadores
// deciden qué hacer sin ella en vez de inventar un número.
export async function tarifaReferencia(
  supabase: SupabaseClient
): Promise<number | null> {
  const { data } = await supabase
    .from("configuracion")
    .select("valor")
    .eq("clave", CLAVE_TARIFA)
    .maybeSingle()
  const valor = Number(data?.valor)
  return Number.isFinite(valor) && valor > 0 ? valor : null
}

import "server-only"

import type Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"

// Contador de uso de la API de Claude: cada llamada queda en uso_api con su
// costo en USD (ver la migración). Los precios son los de lista de Anthropic
// por millón de tokens; si cambian, se actualizan acá (las filas viejas
// guardan el costo de su momento).

type Precio = {
  entrada: number
  salida: number
  // Prompts de más de `umbral` tokens de entrada se cobran a otro precio
  // (toda la llamada).
  umbral?: number
  entradaLargo?: number
  salidaLargo?: number
}

const PRECIOS: Record<string, Precio> = {
  "claude-haiku-5-5": { entrada: 0.1, salida: 0.5, umbral: 100_000, entradaLargo: 0.5, salidaLargo: 2.5 },
}

// Escribir en la caché cuesta 1,25× la entrada (TTL de 5 minutos) y leerla 0,1×.
const FACTOR_CACHE_ESCRITURA = 1.25
const FACTOR_CACHE_LECTURA = 0.1

export type FuncionApi = "chat_web"

export function costoUsd(modelo: string, usage: Anthropic.Usage): number {
  const p = PRECIOS[modelo]
  if (!p) return 0
  const entrada = usage.input_tokens
  const escritura = usage.cache_creation_input_tokens ?? 0
  const lectura = usage.cache_read_input_tokens ?? 0
  const largo = p.umbral !== undefined && entrada + escritura + lectura > p.umbral
  const pe = largo ? (p.entradaLargo ?? p.entrada) : p.entrada
  const ps = largo ? (p.salidaLargo ?? p.salida) : p.salida
  return (
    (entrada * pe + escritura * pe * FACTOR_CACHE_ESCRITURA + lectura * pe * FACTOR_CACHE_LECTURA + usage.output_tokens * ps) /
    1_000_000
  )
}

// Anota una llamada. No corta el flujo si falla: el costo igual se puede
// reconstruir de los tokens.
export async function registrarUsoApi(
  admin: SupabaseClient,
  llamada: { funcion: FuncionApi; modelo: string; usage: Anthropic.Usage; referencia?: string | null }
): Promise<number> {
  const costo = costoUsd(llamada.modelo, llamada.usage)
  const { error } = await admin.from("uso_api").insert({
    funcion: llamada.funcion,
    modelo: llamada.modelo,
    tokens_entrada: llamada.usage.input_tokens,
    tokens_cache_escritura: llamada.usage.cache_creation_input_tokens ?? 0,
    tokens_cache_lectura: llamada.usage.cache_read_input_tokens ?? 0,
    tokens_salida: llamada.usage.output_tokens,
    costo_usd: costo,
    referencia: llamada.referencia ?? null,
  })
  if (error) console.error("No se pudo registrar el uso de la API:", error.message)
  if (!PRECIOS[llamada.modelo]) console.error(`Uso de la API: falta el precio de ${llamada.modelo} en lib/uso-api.ts`)
  return costo
}

export const NOMBRE_FUNCION: Record<string, string> = { chat_web: "Chat de la web" }

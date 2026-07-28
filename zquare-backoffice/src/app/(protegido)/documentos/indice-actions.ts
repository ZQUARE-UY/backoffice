"use server"

import { driveConfigurado } from "@/lib/drive"
import { indexar as correrIndexador, type ResultadoIndexacion } from "@/lib/indexador"
import { createClient } from "@/lib/supabase/server"

// Server actions del índice de búsqueda. La lógica vive en lib/indexador
// (compartida con el cron diario); acá corre con la sesión del socio (RLS).
// El cliente vuelve a llamar a indexar() mientras queden pendientes.

export type EstadoIndice = {
  fragmentos: number
  documentos: number
  driveConfigurado: boolean
}

export async function estadoIndice(): Promise<EstadoIndice> {
  // Tolerante a que la migración todavía no esté aplicada (tabla inexistente):
  // la página de Documentos no debe romperse por el índice.
  try {
    const supabase = await createClient()
    const { count, error } = await supabase
      .from("fragmentos_busqueda")
      .select("*", { count: "exact", head: true })
    if (error) throw new Error(error.message)
    const { data } = await supabase
      .from("fragmentos_busqueda")
      .select("origen_id")
      .limit(10000)
    const documentos = new Set((data ?? []).map((f) => f.origen_id)).size
    return {
      fragmentos: count ?? 0,
      documentos,
      driveConfigurado: driveConfigurado(),
    }
  } catch {
    return { fragmentos: 0, documentos: 0, driveConfigurado: false }
  }
}

export async function indexar(): Promise<ResultadoIndexacion> {
  const supabase = await createClient()
  return correrIndexador(supabase)
}

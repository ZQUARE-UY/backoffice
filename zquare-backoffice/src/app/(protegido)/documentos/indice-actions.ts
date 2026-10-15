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
  // Archivos de Drive (sin contar decisiones) que ya están en el índice.
  archivosIndexados: number
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
      .select("origen, origen_id")
      .limit(10000)
    const filas = (data ?? []) as { origen: string; origen_id: string }[]
    const documentos = new Set(filas.map((f) => f.origen_id)).size
    const archivosIndexados = new Set(filas.filter((f) => f.origen === "drive").map((f) => f.origen_id)).size
    return {
      fragmentos: count ?? 0,
      documentos,
      archivosIndexados,
      driveConfigurado: driveConfigurado(),
    }
  } catch {
    return { fragmentos: 0, documentos: 0, archivosIndexados: 0, driveConfigurado: false }
  }
}

export async function indexar(): Promise<ResultadoIndexacion> {
  const supabase = await createClient()
  return correrIndexador(supabase)
}

// Vista previa de un archivo para su ficha: el principio del texto que ya
// guardó el índice. No vuelve a Drive; si el archivo no está indexado, null.
export async function vistaPrevia(fileId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("fragmentos_busqueda")
    .select("fragmento")
    .eq("origen", "drive")
    .eq("origen_id", fileId)
    .order("indice")
    .limit(3)
  const texto = ((data ?? []) as { fragmento: string }[]).map((f) => f.fragmento).join("\n\n").trim()
  return texto || null
}

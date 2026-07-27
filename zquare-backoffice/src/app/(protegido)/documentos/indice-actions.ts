"use server"

import { driveConfigurado, listarTodosLosArchivos } from "@/lib/drive"
import { generarEmbeddings, trocearTexto } from "@/lib/embeddings"
import { esIndexable, extraerTexto } from "@/lib/extraer-texto"
import { createClient } from "@/lib/supabase/server"

// Indexación para la búsqueda semántica. Procesa de a lotes chicos para no
// pasarse del tiempo máximo de una server action en Vercel: el cliente vuelve
// a llamar mientras queden pendientes.

// Presupuesto de fragmentos por pasada: con la Edge Function limitada a 2
// textos por invocación (~1s c/u), ~40 fragmentos son ~25s — margen de sobra
// dentro de los 60s de Vercel. Siempre se procesa al menos un archivo.
const PRESUPUESTO_FRAGMENTOS = 40
const MAX_ARCHIVOS_POR_PASADA = 8

export type EstadoIndice = {
  fragmentos: number
  documentos: number
  driveConfigurado: boolean
}

export type ResultadoIndexacion = {
  procesados: number
  pendientes: number
  errores: string[]
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

type Indexado = { origen_id: string; modificado: string | null }

async function indexadosPorOrigen(
  origen: "drive" | "decision"
): Promise<Map<string, string | null>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("fragmentos_busqueda")
    .select("origen_id, modificado")
    .eq("origen", origen)
    .limit(10000)
  if (error) throw new Error(error.message)
  const mapa = new Map<string, string | null>()
  for (const f of (data ?? []) as Indexado[]) mapa.set(f.origen_id, f.modificado)
  return mapa
}

// Un paso de indexación. Idempotente: saltea lo que no cambió.
export async function indexar(): Promise<ResultadoIndexacion> {
  const supabase = await createClient()
  const errores: string[] = []
  let procesados = 0

  // ── Decisiones (baratas: se procesan todas en cada pasada) ──
  const decisionesIndexadas = await indexadosPorOrigen("decision")
  const { data: decisiones } = await supabase
    .from("decisiones")
    .select("id, titulo, detalle, participantes, cliente_id, updated_at")
    .is("deleted_at", null)

  const idsDecisiones = new Set<string>()
  for (const d of decisiones ?? []) {
    idsDecisiones.add(d.id)
    const previo = decisionesIndexadas.get(d.id)
    if (previo && new Date(previo) >= new Date(d.updated_at)) continue

    const texto = [d.titulo, d.detalle, (d.participantes ?? []).join(", ")]
      .filter(Boolean)
      .join("\n\n")
    const fragmentos = trocearTexto(texto)
    if (fragmentos.length === 0) continue
    try {
      const embeddings = await generarEmbeddings(fragmentos)
      await supabase
        .from("fragmentos_busqueda")
        .delete()
        .eq("origen", "decision")
        .eq("origen_id", d.id)
      const { error } = await supabase.from("fragmentos_busqueda").insert(
        fragmentos.map((fragmento, indice) => ({
          origen: "decision",
          origen_id: d.id,
          titulo: d.titulo,
          url: "/decisiones",
          cliente_id: d.cliente_id,
          indice,
          fragmento,
          modificado: d.updated_at,
          embedding: embeddings[indice],
        }))
      )
      if (error) throw new Error(error.message)
      procesados++
    } catch (e) {
      errores.push(`Decisión "${d.titulo}": ${(e as Error).message}`)
    }
  }

  // Limpiar decisiones borradas del índice.
  const decisionesHuerfanas = [...decisionesIndexadas.keys()].filter(
    (id) => !idsDecisiones.has(id)
  )
  if (decisionesHuerfanas.length > 0) {
    await supabase
      .from("fragmentos_busqueda")
      .delete()
      .eq("origen", "decision")
      .in("origen_id", decisionesHuerfanas)
  }

  // ── Archivos de Drive (de a LOTE_ARCHIVOS por pasada) ──
  if (!driveConfigurado()) {
    return { procesados, pendientes: 0, errores }
  }

  const archivos = (await listarTodosLosArchivos()).filter(esIndexable)
  const driveIndexado = await indexadosPorOrigen("drive")

  // Limpiar archivos que ya no existen en Drive.
  const idsDrive = new Set(archivos.map((a) => a.id))
  const driveHuerfanos = [...driveIndexado.keys()].filter(
    (id) => !idsDrive.has(id)
  )
  if (driveHuerfanos.length > 0) {
    await supabase
      .from("fragmentos_busqueda")
      .delete()
      .eq("origen", "drive")
      .in("origen_id", driveHuerfanos)
  }

  const pendientes = archivos.filter((a) => {
    const previo = driveIndexado.get(a.id)
    return !previo || new Date(previo) < new Date(a.modificado)
  })

  let fragmentosUsados = 0
  let archivosEstaPasada = 0

  for (const archivo of pendientes) {
    // Cortar la pasada cuando se agota el presupuesto (pero al menos 1 archivo).
    if (
      archivosEstaPasada > 0 &&
      (fragmentosUsados >= PRESUPUESTO_FRAGMENTOS ||
        archivosEstaPasada >= MAX_ARCHIVOS_POR_PASADA)
    ) {
      break
    }
    archivosEstaPasada++
    try {
      const texto = await extraerTexto(archivo)
      const fragmentos = trocearTexto(texto ?? "")
      fragmentosUsados += Math.max(1, fragmentos.length)
      const embeddings = await generarEmbeddings(fragmentos)

      await supabase
        .from("fragmentos_busqueda")
        .delete()
        .eq("origen", "drive")
        .eq("origen_id", archivo.id)

      if (fragmentos.length > 0) {
        const { error } = await supabase.from("fragmentos_busqueda").insert(
          fragmentos.map((fragmento, indice) => ({
            origen: "drive",
            origen_id: archivo.id,
            titulo: archivo.nombre,
            url: archivo.url,
            indice,
            fragmento,
            modificado: archivo.modificado,
            embedding: embeddings[indice],
          }))
        )
        if (error) throw new Error(error.message)
      } else {
        // Sin texto útil: dejamos una marca para no reintentarlo cada pasada.
        await supabase.from("fragmentos_busqueda").insert({
          origen: "drive",
          origen_id: archivo.id,
          titulo: archivo.nombre,
          url: archivo.url,
          indice: 0,
          fragmento: archivo.nombre,
          modificado: archivo.modificado,
          embedding: (await generarEmbeddings([archivo.nombre]))[0],
        })
      }
      procesados++
    } catch (e) {
      errores.push(`${archivo.nombre}: ${(e as Error).message}`)
    }
  }

  return {
    procesados,
    pendientes: Math.max(0, pendientes.length - archivosEstaPasada),
    errores,
  }
}

import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { driveConfigurado, listarTodosLosArchivos } from "@/lib/drive"
import { generarEmbeddings, trocearTexto } from "@/lib/embeddings"
import { esIndexable, extraerTexto } from "@/lib/extraer-texto"

// Lógica de indexación para la búsqueda semántica, compartida entre el botón
// "Actualizar índice" de /documentos (cliente con sesión del socio, respeta
// RLS) y el cron diario /api/cron/reindexar (cliente admin). Idempotente:
// saltea lo que no cambió desde la última pasada (columna `modificado`).

// Presupuesto de fragmentos por pasada: Workers AI procesa lotes de 20 en
// ~1-2s, así que 120 fragmentos son ~6 requests — margen de sobra dentro de
// los 60s de Vercel. Siempre se procesa al menos un archivo.
const PRESUPUESTO_FRAGMENTOS = 120
const MAX_ARCHIVOS_POR_PASADA = 8

export type ResultadoIndexacion = {
  procesados: number
  pendientes: number
  errores: string[]
}

async function indexadosPorOrigen(
  supabase: SupabaseClient,
  origen: "drive" | "decision" | "idea"
): Promise<Map<string, string | null>> {
  const { data, error } = await supabase
    .from("fragmentos_busqueda")
    .select("origen_id, modificado")
    .eq("origen", origen)
    .limit(10000)
  if (error) throw new Error(error.message)
  const mapa = new Map<string, string | null>()
  for (const f of data ?? []) mapa.set(f.origen_id, f.modificado)
  return mapa
}

// Un paso de indexación. El que llama repite mientras `pendientes > 0`.
export async function indexar(
  supabase: SupabaseClient
): Promise<ResultadoIndexacion> {
  const errores: string[] = []
  let procesados = 0

  // ── Decisiones (baratas: se procesan todas en cada pasada) ──
  const decisionesIndexadas = await indexadosPorOrigen(supabase, "decision")
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

  // ── Ideas (baratas: se procesan todas en cada pasada) ──
  const ideasIndexadas = await indexadosPorOrigen(supabase, "idea")
  const { data: ideas } = await supabase
    .from("ideas")
    .select(
      "id, titulo, descripcion, problema, solucion, esfuerzo, impacto, proximos_pasos, etiquetas, updated_at"
    )
    .is("deleted_at", null)

  const idsIdeas = new Set<string>()
  for (const i of ideas ?? []) {
    idsIdeas.add(i.id)
    const previo = ideasIndexadas.get(i.id)
    if (previo && new Date(previo) >= new Date(i.updated_at)) continue

    const texto = [
      i.titulo,
      i.descripcion,
      i.problema,
      i.solucion,
      i.esfuerzo,
      i.impacto,
      i.proximos_pasos,
      (i.etiquetas ?? []).join(", "),
    ]
      .filter(Boolean)
      .join("\n\n")
    const fragmentos = trocearTexto(texto)
    if (fragmentos.length === 0) continue
    try {
      const embeddings = await generarEmbeddings(fragmentos)
      await supabase
        .from("fragmentos_busqueda")
        .delete()
        .eq("origen", "idea")
        .eq("origen_id", i.id)
      const { error } = await supabase.from("fragmentos_busqueda").insert(
        fragmentos.map((fragmento, indice) => ({
          origen: "idea",
          origen_id: i.id,
          titulo: i.titulo,
          url: `/ideas/${i.id}`,
          indice,
          fragmento,
          modificado: i.updated_at,
          embedding: embeddings[indice],
        }))
      )
      if (error) throw new Error(error.message)
      procesados++
    } catch (e) {
      errores.push(`Idea "${i.titulo}": ${(e as Error).message}`)
    }
  }

  // Limpiar ideas borradas del índice.
  const ideasHuerfanas = [...ideasIndexadas.keys()].filter(
    (id) => !idsIdeas.has(id)
  )
  if (ideasHuerfanas.length > 0) {
    await supabase
      .from("fragmentos_busqueda")
      .delete()
      .eq("origen", "idea")
      .in("origen_id", ideasHuerfanas)
  }

  // ── Archivos de Drive (de a MAX_ARCHIVOS_POR_PASADA por pasada) ──
  if (!driveConfigurado()) {
    return { procesados, pendientes: 0, errores }
  }

  const archivos = (await listarTodosLosArchivos()).filter(esIndexable)
  const driveIndexado = await indexadosPorOrigen(supabase, "drive")

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

import "server-only"

import { createClient } from "@/lib/supabase/server"

// Genera embeddings llamando a la Edge Function `embeddings` (gte-small,
// 384 dimensiones). La invocación viaja con el JWT del socio logueado.

const LOTE_EDGE = 30 // máximo de textos por invocación (límite de la función)

export async function generarEmbeddings(textos: string[]): Promise<number[][]> {
  if (textos.length === 0) return []
  const supabase = await createClient()

  const resultado: number[][] = []
  for (let i = 0; i < textos.length; i += LOTE_EDGE) {
    const lote = textos.slice(i, i + LOTE_EDGE)
    const { data, error } = await supabase.functions.invoke("embeddings", {
      body: { textos: lote },
    })
    if (error) {
      throw new Error(
        `No se pudieron generar embeddings (¿está deployada la Edge Function "embeddings"?): ${error.message}`
      )
    }
    resultado.push(...(data.embeddings as number[][]))
  }
  return resultado
}

// Trocea un texto largo en fragmentos de ~1200 caracteres cortando por
// párrafos (gte-small procesa hasta ~512 tokens; 1200 caracteres en español
// entran cómodos). Devuelve fragmentos no vacíos y normalizados.
const TAMANO_FRAGMENTO = 1200
const MAX_FRAGMENTOS = 60 // tope por documento, por si aparece un monstruo

export function trocearTexto(texto: string): string[] {
  const limpio = texto.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim()
  if (!limpio) return []

  const parrafos = limpio.split(/\n{2,}|\n(?=[-•*#])/)
  const fragmentos: string[] = []
  let actual = ""

  for (const parrafo of parrafos) {
    const p = parrafo.trim()
    if (!p) continue
    if (actual && actual.length + p.length + 1 > TAMANO_FRAGMENTO) {
      fragmentos.push(actual)
      actual = ""
    }
    if (p.length > TAMANO_FRAGMENTO) {
      // Párrafo gigante: cortar duro cada TAMANO_FRAGMENTO.
      for (let i = 0; i < p.length; i += TAMANO_FRAGMENTO) {
        fragmentos.push(p.slice(i, i + TAMANO_FRAGMENTO))
      }
      continue
    }
    actual = actual ? `${actual}\n${p}` : p
  }
  if (actual) fragmentos.push(actual)

  return fragmentos.filter((f) => f.length >= 20).slice(0, MAX_FRAGMENTOS)
}

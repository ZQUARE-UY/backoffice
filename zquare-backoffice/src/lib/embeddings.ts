import "server-only"

// Genera embeddings con Cloudflare Workers AI (@cf/baai/bge-m3, 1024
// dimensiones, multilingüe — rankea bien el español, a diferencia del
// gte-small que usábamos antes). Capa gratis: 10k neurons/día, de sobra
// para nuestro volumen.
//
// Env vars (en .env.local y Vercel):
//   CLOUDFLARE_ACCOUNT_ID — dashboard → Workers & Pages, columna derecha.
//   CLOUDFLARE_AI_TOKEN   — API token con la plantilla "Workers AI".

const MODELO = "@cf/baai/bge-m3"

// Textos por request: lotes chicos para no pasarnos del límite de payload
// y que un lote caído no tire un reindexado entero.
const LOTE = 20

export async function generarEmbeddings(textos: string[]): Promise<number[][]> {
  if (textos.length === 0) return []

  const cuenta = process.env.CLOUDFLARE_ACCOUNT_ID
  const token = process.env.CLOUDFLARE_AI_TOKEN
  if (!cuenta || !token) {
    throw new Error(
      "Faltan CLOUDFLARE_ACCOUNT_ID o CLOUDFLARE_AI_TOKEN (Workers AI, modelo bge-m3)"
    )
  }

  const resultado: number[][] = []
  for (let i = 0; i < textos.length; i += LOTE) {
    const lote = textos.slice(i, i + LOTE)
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cuenta}/ai/run/${MODELO}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: lote, truncate_inputs: true }),
      }
    )
    if (!res.ok) {
      throw new Error(
        `Workers AI respondió ${res.status}: ${(await res.text()).slice(0, 300)}`
      )
    }
    const json = (await res.json()) as {
      success: boolean
      result?: { data?: number[][] }
      errors?: { message: string }[]
    }
    const data = json.result?.data
    if (!json.success || !Array.isArray(data) || data.length !== lote.length) {
      throw new Error(
        `Workers AI devolvió una respuesta inesperada: ${JSON.stringify(json).slice(0, 300)}`
      )
    }
    resultado.push(...data)
  }
  return resultado
}

// Trocea un texto largo en fragmentos de ~1200 caracteres cortando por
// párrafos. bge-m3 acepta hasta 8k tokens, pero fragmentos chicos dan
// mejor granularidad de búsqueda. Devuelve fragmentos no vacíos.
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

// Edge Function `embeddings`: genera embeddings con gte-small (384 dim),
// el modelo que corre nativo en el runtime de Supabase — costo cero.
//
// Deploy: Dashboard de Supabase → Edge Functions → Deploy new function →
// nombre "embeddings", pegar este archivo. Dejar "Verify JWT" activado:
// solo usuarios autenticados (los socios) pueden invocarla.
//
// Request:  POST { "textos": ["...", "..."] }   (máx 30 por llamada)
// Response: { "embeddings": [[...384 floats...], ...] }

// Globales del runtime de Supabase Edge (Deno), declarados para que el
// tsconfig/eslint del proyecto Next no protesten.
declare const Supabase: {
  ai: {
    Session: new (modelo: string) => {
      run(
        texto: string,
        opciones: { mean_pool: boolean; normalize: boolean }
      ): Promise<number[]>
    }
  }
}
declare const Deno: {
  serve(handler: (req: Request) => Promise<Response> | Response): void
}

const session = new Supabase.ai.Session("gte-small")

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  let textos: unknown
  try {
    textos = (await req.json()).textos
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 })
  }

  if (
    !Array.isArray(textos) ||
    textos.length === 0 ||
    textos.length > 30 ||
    textos.some((t) => typeof t !== "string" || t.length === 0 || t.length > 8000)
  ) {
    return Response.json(
      { error: "Se espera { textos: string[] } (1-30 textos, hasta 8000 caracteres c/u)" },
      { status: 400 }
    )
  }

  const embeddings: number[][] = []
  for (const texto of textos as string[]) {
    const vector = await session.run(texto, { mean_pool: true, normalize: true })
    embeddings.push(Array.from(vector as number[]))
  }

  return Response.json({ embeddings })
})

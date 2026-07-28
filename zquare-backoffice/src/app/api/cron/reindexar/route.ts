import { NextResponse } from "next/server"

import { indexar } from "@/lib/indexador"
import { createAdminClient } from "@/lib/supabase/admin"

// Cron diario (vercel.json): reindexa lo que cambió en Drive y decisiones
// para que el Cmd+K esté al día sin que nadie toque "Actualizar índice".
// Auth: Vercel manda `Authorization: Bearer ${CRON_SECRET}` si la env var
// está definida. Loopea pasadas hasta terminar o acercarse al límite de
// tiempo; lo que quede sigue en la corrida siguiente (es idempotente).

export const maxDuration = 60

const TOPE_MS = 45_000

export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET
  if (!secreto) {
    return NextResponse.json(
      { error: "Falta CRON_SECRET; el cron queda deshabilitado" },
      { status: 503 }
    )
  }
  if (req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return new Response("No autorizado", { status: 401 })
  }

  const supabase = createAdminClient()
  const inicio = Date.now()
  let procesados = 0
  let pendientes = 0
  const errores: string[] = []

  do {
    const paso = await indexar(supabase)
    procesados += paso.procesados
    pendientes = paso.pendientes
    errores.push(...paso.errores)
    // Sin progreso y con errores: cortar en vez de repetir el mismo fallo.
    if (paso.procesados === 0 && paso.errores.length > 0) break
  } while (pendientes > 0 && Date.now() - inicio < TOPE_MS)

  const resultado = { procesados, pendientes, errores }
  if (errores.length > 0) {
    console.error("Cron reindexar terminó con errores:", resultado)
  }
  return NextResponse.json(resultado)
}

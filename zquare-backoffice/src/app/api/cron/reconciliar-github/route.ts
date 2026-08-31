import { NextResponse } from "next/server"

import { reconciliarTareas } from "@/lib/tareas-github"

// Cron diario (vercel.json): reenvía a GitHub las tarjetas que quedaron sin
// espejar (por ejemplo, si GitHub estaba caído cuando se guardó la tarjeta).
// El push normal es en línea al escribir; esto es solo la red de seguridad.
// Auth igual que reindexar: Vercel manda `Authorization: Bearer ${CRON_SECRET}`.

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

  const inicio = Date.now()
  let procesadas = 0
  const errores: string[] = []
  let paso: { procesadas: number; errores: string[] }
  do {
    paso = await reconciliarTareas(30)
    procesadas += paso.procesadas
    errores.push(...paso.errores)
  } while (paso.procesadas > 0 && Date.now() - inicio < TOPE_MS)

  const resultado = { procesadas, errores }
  if (errores.length > 0) {
    console.error("Cron reconciliar-github terminó con errores:", resultado)
  }
  return NextResponse.json(resultado)
}

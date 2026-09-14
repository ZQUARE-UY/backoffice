import { NextResponse } from "next/server"

import { sincronizarRecurrentes } from "@/lib/finanzas"
import { createAdminClient } from "@/lib/supabase/admin"

// Cron diario (vercel.json): convierte los movimientos recurrentes en
// movimientos reales. Confirma los que vencieron y deja previsto el próximo.
// Idempotente: correrlo dos veces no duplica nada. Corre a las 04:00 de
// Montevideo, así lo que vence hoy ya figura confirmado a la mañana.
// Auth igual que reindexar: Vercel manda `Authorization: Bearer ${CRON_SECRET}`.

export const maxDuration = 60

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

  const resultado = await sincronizarRecurrentes(createAdminClient())
  if (resultado.errores.length > 0) {
    console.error("Cron recurrentes terminó con errores:", resultado)
  }
  return NextResponse.json(resultado)
}

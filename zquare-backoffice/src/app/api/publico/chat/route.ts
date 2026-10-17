import { NextResponse } from "next/server"

import { MAX_MENSAJE, responder } from "@/lib/chat-web"
import { encabezadosCors, origenPermitido } from "@/lib/consultas-web"
import { dispositivo, esRobot } from "@/lib/eventos-web"
import { createAdminClient } from "@/lib/supabase/admin"

// Chat con IA de zquare.uy. Público (sin sesión): lo protegen el origen
// permitido y los topes de lib/chat-web.ts (largo del mensaje, mensajes por
// conversación y conversaciones nuevas por hora). La web manda el id de la
// conversación y el mensaje nuevo; la historia vive en la base.

export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function OPTIONS(req: Request) {
  const origen = req.headers.get("origin")
  return new Response(null, { status: origenPermitido(origen) ? 204 : 403, headers: encabezadosCors(origen) })
}

export async function POST(req: Request) {
  const origen = req.headers.get("origin")
  const cors = encabezadosCors(origen)
  if (!origenPermitido(origen)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: cors })
  }
  const ua = req.headers.get("user-agent") ?? ""
  if (esRobot(ua)) return NextResponse.json({ error: "No disponible" }, { status: 403, headers: cors })

  let cuerpo: Record<string, unknown>
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: "El cuerpo debe ser JSON" }, { status: 400, headers: cors })
  }

  const mensaje = typeof cuerpo.mensaje === "string" ? cuerpo.mensaje.trim() : ""
  if (!mensaje) return NextResponse.json({ error: "Falta el mensaje" }, { status: 400, headers: cors })
  if (mensaje.length > MAX_MENSAJE) {
    return NextResponse.json({ error: `El mensaje es muy largo (máximo ${MAX_MENSAJE} caracteres)` }, { status: 400, headers: cors })
  }

  // Sin la key de la API de Claude (Vercel → env vars) el chat no anda; la
  // web lo esconde y queda el formulario.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "El chat no está configurado" }, { status: 503, headers: cors })
  }

  const resultado = await responder(createAdminClient(), {
    chatId: typeof cuerpo.chat_id === "string" && UUID.test(cuerpo.chat_id) ? cuerpo.chat_id : null,
    mensaje,
    idioma: cuerpo.lang === "en" ? "en" : "es",
    ruta: typeof cuerpo.ruta === "string" ? cuerpo.ruta.slice(0, 200) : null,
    dispositivo: dispositivo(ua, cuerpo.w),
  })
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.status, headers: cors })
  }
  return NextResponse.json(
    {
      chat_id: resultado.chatId,
      respuesta: resultado.respuesta,
      consulta: resultado.consulta,
      ultimo: resultado.ultimo,
    },
    { headers: cors }
  )
}

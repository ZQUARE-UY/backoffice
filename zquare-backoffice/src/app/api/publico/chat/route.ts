import { NextResponse } from "next/server"

import { cargarConfigChat, MAX_MENSAJE, responder, TEMAS_CHAT } from "@/lib/chat-web"
import { encabezadosCors, origenPermitido } from "@/lib/consultas-web"
import { dispositivo, esRobot, hashVisitante, origenVisita } from "@/lib/eventos-web"
import { hoyUruguay } from "@/lib/finanzas"
import { createAdminClient } from "@/lib/supabase/admin"

// Chat con IA de zquare.uy. Público (sin sesión): lo protegen el origen
// permitido y los topes de lib/chat-web.ts (largo del mensaje, mensajes por
// conversación y conversaciones nuevas por hora, en total y por visitante).
// La web manda el id de la conversación y el mensaje nuevo; la historia vive
// en la base.

export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Lo que la web necesita antes de mostrar el chat: si está prendido (y
// configurado) y el saludo. Público y cacheado un minuto en el CDN.
export async function GET(req: Request) {
  const cors = encabezadosCors(req.headers.get("origin"))
  try {
    const config = await cargarConfigChat(createAdminClient())
    return NextResponse.json(
      { activo: config.activo && !!process.env.ANTHROPIC_API_KEY, saludo: config.saludo },
      { headers: { ...cors, "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" } }
    )
  } catch (e) {
    console.error("Chat web: no se pudo leer la configuración", e)
    return NextResponse.json({ activo: false }, { status: 500, headers: { ...cors, "Cache-Control": "no-store" } })
  }
}

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

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? ""
  const resultado = await responder(createAdminClient(), {
    chatId: typeof cuerpo.chat_id === "string" && UUID.test(cuerpo.chat_id) ? cuerpo.chat_id : null,
    mensaje,
    idioma: cuerpo.lang === "en" ? "en" : "es",
    ruta: typeof cuerpo.ruta === "string" ? cuerpo.ruta.slice(0, 200) : null,
    dispositivo: dispositivo(ua, cuerpo.w),
    visitante: hashVisitante(ip, ua, hoyUruguay()),
    rapida: cuerpo.rapida === true,
    // desde el botón de un servicio (clave validada en responder)
    tema: typeof cuerpo.tema === "string" && cuerpo.tema in TEMAS_CHAT ? cuerpo.tema : null,
    origen: origenVisita(cuerpo),
    // Vercel los manda sin guardar la IP; la ciudad viene codificada para URL.
    pais: req.headers.get("x-vercel-ip-country"),
    ciudad: ciudad(req.headers.get("x-vercel-ip-city")),
  })
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.status, headers: cors })
  }
  return NextResponse.json(
    {
      chat_id: resultado.chatId,
      respuesta: resultado.respuesta,
      sugerencias: resultado.sugerencias,
      consulta: resultado.consulta,
      ultimo: resultado.ultimo,
    },
    { headers: cors }
  )
}

function ciudad(valor: string | null): string | null {
  if (!valor) return null
  try {
    return decodeURIComponent(valor).slice(0, 80)
  } catch {
    return null
  }
}

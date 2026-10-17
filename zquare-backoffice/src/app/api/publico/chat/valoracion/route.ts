import { NextResponse } from "next/server"

import { valorar } from "@/lib/chat-web"
import { encabezadosCors, origenPermitido } from "@/lib/consultas-web"
import { createAdminClient } from "@/lib/supabase/admin"

// 👍/👎 del chat de zquare.uy: la web manda { chat_id, valor: 1 | -1 | 0 }
// (0 lo saca). Se ve en Web → Chats.

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

  let cuerpo: Record<string, unknown>
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: "El cuerpo debe ser JSON" }, { status: 400, headers: cors })
  }
  const chatId = typeof cuerpo.chat_id === "string" && UUID.test(cuerpo.chat_id) ? cuerpo.chat_id : null
  const valor = cuerpo.valor === 1 || cuerpo.valor === -1 ? cuerpo.valor : cuerpo.valor === 0 ? null : undefined
  if (!chatId || valor === undefined) {
    return NextResponse.json({ error: "Faltan chat_id o valor (1, -1 o 0)" }, { status: 400, headers: cors })
  }

  const ok = await valorar(createAdminClient(), chatId, valor)
  if (!ok) return NextResponse.json({ error: "No se encontró la conversación" }, { status: 404, headers: cors })
  return NextResponse.json({ ok: true }, { headers: cors })
}

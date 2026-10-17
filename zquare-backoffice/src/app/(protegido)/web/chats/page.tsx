import type Anthropic from "@anthropic-ai/sdk"

import { mensajesVisibles } from "@/lib/chat-web"
import { createClient } from "@/lib/supabase/server"

import { VistaChats, type ChatLista } from "./vista-chats"

export const metadata = { title: "Chats · Web" }

// Conversaciones del chat con IA de zquare.uy: las últimas 100 y la elegida
// (`?chat=<id>`), con lo que se vio en la web. La vista está en vista-chats.tsx.
export default async function ChatsWebPage({ searchParams }: { searchParams: Promise<{ chat?: string }> }) {
  const { chat: elegidoParam } = await searchParams
  const supabase = await createClient()

  const { data } = await supabase
    .from("chats_web")
    .select("id, turnos, idioma, dispositivo, created_at, updated_at, consulta_id, primero:mensajes->0->>content, consultas_web(nombre)")
    .is("deleted_at", null)
    .gt("turnos", 0)
    .order("updated_at", { ascending: false })
    .limit(100)
  const chats = (data ?? []) as unknown as ChatLista[]

  const elegidoId = chats.find((c) => c.id === elegidoParam)?.id ?? chats[0]?.id ?? null
  let elegido = null
  if (elegidoId) {
    const { data: completo } = await supabase
      .from("chats_web")
      .select("mensajes, tokens_entrada, tokens_salida, ruta")
      .eq("id", elegidoId)
      .maybeSingle<{ mensajes: Anthropic.MessageParam[]; tokens_entrada: number; tokens_salida: number; ruta: string | null }>()
    if (completo) {
      elegido = {
        ...chats.find((c) => c.id === elegidoId)!,
        mensajes: mensajesVisibles(completo.mensajes),
        tokensEntrada: completo.tokens_entrada,
        tokensSalida: completo.tokens_salida,
        ruta: completo.ruta,
      }
    }
  }

  return <VistaChats chats={chats} elegido={elegido} elegidoEnUrl={!!elegidoParam} />
}

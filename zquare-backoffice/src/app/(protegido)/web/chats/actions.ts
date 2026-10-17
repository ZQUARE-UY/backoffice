"use server"

import { revalidatePath } from "next/cache"

import { CLAVE_CONFIG_CHAT, leerConfigChat, type ConfigChat } from "@/lib/chat-web-config"
import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"

// Guarda la configuración del chat de la web (Web → Chats → Configurar). Se
// aplica en el próximo mensaje; la web la ve en hasta un minuto (CDN).
export async function guardarConfigChat(config: ConfigChat) {
  const socio = await idSocioActual()
  if (!socio) throw new Error("No autorizado")

  const supabase = await createClient()
  const { error } = await supabase.from("configuracion").upsert({
    clave: CLAVE_CONFIG_CHAT,
    valor: leerConfigChat(config),
    descripcion: "Chat con IA de zquare.uy (Web → Chats → Configurar)",
    updated_by: socio,
  })
  if (error) throw new Error(`No se pudo guardar: ${error.message}`)
  revalidatePath("/web/chats")
}

export type EstadoChat = "nuevo" | "revisado" | "archivado"

export async function cambiarEstadoChat(id: string, estado: EstadoChat) {
  const socio = await idSocioActual()
  if (!socio) throw new Error("No autorizado")
  const supabase = await createClient()
  const { error } = await supabase
    .from("chats_web")
    .update({
      estado,
      revisado_por: estado === "nuevo" ? null : socio,
      revisado_at: estado === "nuevo" ? null : new Date().toISOString(),
    })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/web/chats")
}

// Notas y etiquetas de los socios sobre la conversación.
export async function guardarGestionChat(id: string, datos: { notas: string; etiquetas: string[] }) {
  const socio = await idSocioActual()
  if (!socio) throw new Error("No autorizado")
  const etiquetas = [...new Set(datos.etiquetas.map((e) => e.trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 12)
  const supabase = await createClient()
  const { error } = await supabase
    .from("chats_web")
    .update({ notas: datos.notas.trim().slice(0, 5000) || null, etiquetas })
    .eq("id", id)
  if (error) throw new Error(`No se pudo guardar: ${error.message}`)
  revalidatePath("/web/chats")
}

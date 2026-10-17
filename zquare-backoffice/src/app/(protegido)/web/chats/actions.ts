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

// Configuración del chat con IA de la web (Web → Chats → Configurar). Se guarda
// en la tabla configuracion, clave "web_chat"; lo que falte o esté fuera de
// rango toma el valor por defecto. La usan el bot (lib/chat-web.ts), la ruta
// pública y el formulario del backoffice.

export const CLAVE_CONFIG_CHAT = "web_chat"

export type ConfigChat = {
  // Apagado, la web no muestra el chat y la ruta no responde.
  activo: boolean
  // Primer mensaje que ve la persona (no lo genera la IA). Vacío = el de la web.
  saludo: { es: string; en: string }
  // Lo que el bot sabe además del contenido publicado: preguntas frecuentes,
  // qué no hacemos, casos que se pueden mencionar.
  info: string
  limites: {
    mensajesPorChat: number
    chatsPorVisitanteHora: number
    chatsHora: number
  }
}

export const MAX_SALUDO = 300
export const MAX_INFO = 8000

// Mínimo, máximo y valor por defecto de cada límite.
export const LIMITES: Record<keyof ConfigChat["limites"], { min: number; max: number; defecto: number; label: string; nota: string }> = {
  mensajesPorChat: { min: 1, max: 50, defecto: 20, label: "Mensajes por conversación", nota: "Mensajes de la persona; al llegar, el chat la deriva al mail." },
  chatsPorVisitanteHora: { min: 1, max: 50, defecto: 5, label: "Conversaciones por visitante por hora", nota: "Frena a una sola persona que abre y cierra pestañas." },
  chatsHora: { min: 1, max: 1000, defecto: 60, label: "Conversaciones nuevas por hora, en total", nota: "Techo de costo: entre todos los visitantes." },
}

export const CONFIG_CHAT_DEFECTO: ConfigChat = {
  activo: true,
  saludo: { es: "", en: "" },
  info: "",
  limites: {
    mensajesPorChat: LIMITES.mensajesPorChat.defecto,
    chatsPorVisitanteHora: LIMITES.chatsPorVisitanteHora.defecto,
    chatsHora: LIMITES.chatsHora.defecto,
  },
}

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}

function entero(v: unknown, l: (typeof LIMITES)[keyof typeof LIMITES]): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(l.max, Math.max(l.min, Math.round(n))) : l.defecto
}

export function leerConfigChat(valor: unknown): ConfigChat {
  const v = (valor && typeof valor === "object" ? valor : {}) as Record<string, unknown>
  const saludo = (v.saludo && typeof v.saludo === "object" ? v.saludo : {}) as Record<string, unknown>
  const limites = (v.limites && typeof v.limites === "object" ? v.limites : {}) as Record<string, unknown>
  return {
    activo: v.activo !== false,
    saludo: { es: texto(saludo.es, MAX_SALUDO), en: texto(saludo.en, MAX_SALUDO) },
    info: texto(v.info, MAX_INFO),
    limites: {
      mensajesPorChat: entero(limites.mensajesPorChat, LIMITES.mensajesPorChat),
      chatsPorVisitanteHora: entero(limites.chatsPorVisitanteHora, LIMITES.chatsPorVisitanteHora),
      chatsHora: entero(limites.chatsHora, LIMITES.chatsHora),
    },
  }
}

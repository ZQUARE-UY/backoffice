import "server-only"

import { createHash } from "node:crypto"

// Métricas propias de la web → backoffice. Lo usa la ruta pública
// /api/publico/eventos. Sin cookies ni IP guardada: el visitante es un hash
// diario (ver la migración de eventos_web).

export const EVENTOS = new Set([
  "page_view",
  "section_view",
  "scroll_depth",
  "cta_click",
  "email_click",
  "language_change",
  "generate_lead",
  "form_error",
  "cookie_consent",
])

// Robots, previsualizadores de links y herramientas de medición: no cuentan.
const ROBOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp|vercel/i

export function esRobot(ua: string): boolean {
  return !ua || ROBOT.test(ua)
}

// Hash del visitante para hoy: IP + navegador + fecha + sal secreta. La sal
// es la service role key (nunca sale del servidor), así el hash no se puede
// recalcular desde afuera.
export function hashVisitante(ip: string, ua: string, dia: string): string {
  const sal = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  return createHash("sha256").update(`${sal}|${dia}|${ip}|${ua}`).digest("hex").slice(0, 16)
}

export function dispositivo(ua: string, ancho: unknown): "movil" | "tablet" | "escritorio" {
  const w = typeof ancho === "number" ? ancho : 0
  if (/ipad|tablet/i.test(ua) || (w >= 600 && w < 1024 && /mobi|android/i.test(ua))) return "tablet"
  if (/mobi|iphone|android/i.test(ua) || (w > 0 && w < 600)) return "movil"
  return "escritorio"
}

function texto(valor: unknown, max: number): string | null {
  if (typeof valor !== "string") return null
  const t = valor.trim()
  return t ? t.slice(0, max) : null
}

// Solo el dominio del referente, y nada si es la propia web.
function dominioReferente(ref: unknown): string | null {
  const t = texto(ref, 500)
  if (!t) return null
  try {
    const host = new URL(t).hostname.replace(/^www\./, "")
    return host === "zquare.uy" ? null : host
  } catch {
    return null
  }
}

// Props chicas y planas: texto o número, a lo sumo 8 claves.
function limpiarProps(props: unknown): Record<string, string | number> {
  if (!props || typeof props !== "object") return {}
  const limpio: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(props).slice(0, 8)) {
    if (typeof v === "number" && Number.isFinite(v)) limpio[k.slice(0, 40)] = v
    else if (typeof v === "string") limpio[k.slice(0, 40)] = v.slice(0, 120)
  }
  return limpio
}

export type Contexto = { visitante: string; pais: string | null; dispositivo: ReturnType<typeof dispositivo> }

// Lote que manda la web: { ruta, ref, utm, lang, w, eventos: [{ n, p }] }.
export function filasDeLote(cuerpo: Record<string, unknown>, ctx: Contexto) {
  const utm = (cuerpo.utm && typeof cuerpo.utm === "object" ? cuerpo.utm : {}) as Record<string, unknown>
  const comun = {
    visitante: ctx.visitante,
    ruta: texto(cuerpo.ruta, 200),
    referente: dominioReferente(cuerpo.ref),
    utm_source: texto(utm.source, 80),
    utm_medium: texto(utm.medium, 80),
    utm_campaign: texto(utm.campaign, 120),
    pais: ctx.pais,
    dispositivo: ctx.dispositivo,
    idioma: cuerpo.lang === "en" ? "en" : cuerpo.lang === "es" ? "es" : null,
  }
  const eventos = Array.isArray(cuerpo.eventos) ? cuerpo.eventos.slice(0, 50) : []
  return eventos
    .filter((e): e is { n: string; p?: unknown } => !!e && typeof e === "object" && EVENTOS.has((e as { n?: string }).n ?? ""))
    .map((e) => ({ ...comun, evento: e.n, props: limpiarProps(e.p) }))
}

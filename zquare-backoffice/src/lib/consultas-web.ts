import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

// Formulario de contacto de la web → backoffice. Lo usa la ruta pública
// /api/publico/contacto. Valida, frena abusos y guarda la consulta en la
// bandeja de la sección Web (sin tocar clientes: eso lo decide un socio al
// promoverla).

// Orígenes que pueden llamar a las rutas públicas desde el navegador: la web
// en producción, sus previews en el equipo zquare de Vercel y, fuera de
// producción, el servidor local de la web (python -m http.server 4321).
const ORIGENES = new Set(["https://zquare.uy", "https://www.zquare.uy"])
const PREVIEW = /^https:\/\/zquare-landing-[a-z0-9-]+-zquare\.vercel\.app$/
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1):4321$/

export function origenPermitido(origen: string | null): string | null {
  if (!origen) return null
  if (ORIGENES.has(origen) || PREVIEW.test(origen)) return origen
  if (process.env.VERCEL_ENV !== "production" && LOCAL.test(origen)) return origen
  return null
}

export function encabezadosCors(origen: string | null): Record<string, string> {
  const permitido = origenPermitido(origen)
  return {
    Vary: "Origin",
    ...(permitido
      ? {
          "Access-Control-Allow-Origin": permitido,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        }
      : {}),
  }
}

export type ConsultaEntrante = {
  nombre: string
  email: string
  empresa: string | null
  // Teléfono o WhatsApp y cómo nos conoció: opcionales, del formulario.
  telefono?: string | null
  conocio?: string | null
  intereses: string[]
  mensaje: string
  idioma: "es" | "en" | null
  // Por dónde llegó: el formulario de contacto (por defecto) o el chat con IA.
  origen?: "formulario" | "chat"
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Opciones de «¿Cómo nos conociste?» del formulario de la web, con el rótulo
// en español (el formulario en inglés manda su traducción; acá se unifica para
// poder filtrar). Las tres primeras son las redes del plan de redes sociales
// (docs/REDES-SOCIALES.md); el chat registra las mismas.
export const CONOCIO = ["Google", "LinkedIn", "Instagram", "Me lo recomendaron", "Ya los conocía", "Otro"] as const
export type Conocio = (typeof CONOCIO)[number]

const CONOCIO_EN: Record<string, Conocio> = {
  "someone recommended you": "Me lo recomendaron",
  "i already knew you": "Ya los conocía",
  other: "Otro",
}

// Lleva lo que mandó el formulario al rótulo en español; lo que no es una
// opción conocida queda como vino.
export function normalizarConocio(valor: string | null): string | null {
  if (!valor) return null
  const clave = valor.trim().toLowerCase()
  return CONOCIO.find((c) => c.toLowerCase() === clave) ?? CONOCIO_EN[clave] ?? valor.trim()
}

// La red por la que llegó la visita según el utm_source de su link
// (zquare.uy/?utm_source=<red>&utm_medium=social, uno por red). Sirve para
// las consultas del chat cuando la persona no contó cómo nos conoció.
export function redDeUtm(utmSource: string | null | undefined): Conocio | null {
  const s = (utmSource ?? "").toLowerCase()
  if (s.includes("linkedin")) return "LinkedIn"
  if (s.includes("instagram")) return "Instagram"
  if (s.includes("google")) return "Google"
  return null
}

function texto(valor: unknown, max: number): string | null {
  if (typeof valor !== "string") return null
  const t = valor.trim()
  return t ? t.slice(0, max) : null
}

// Devuelve la consulta limpia o el motivo por el que no sirve.
export function validarConsulta(cuerpo: Record<string, unknown>): ConsultaEntrante | { error: string } {
  const nombre = texto(cuerpo.name, 120)
  const email = texto(cuerpo.email, 200)?.toLowerCase() ?? null
  const mensaje = texto(cuerpo.message, 5000)
  if (!nombre) return { error: "Falta el nombre" }
  if (!email || !EMAIL.test(email)) return { error: "El email no es válido" }
  if (!mensaje) return { error: "Falta el mensaje" }
  const intereses = Array.isArray(cuerpo.interests)
    ? cuerpo.interests
        .map((i) => texto(i, 60))
        .filter((i): i is string => !!i)
        .slice(0, 10)
    : []
  return {
    nombre,
    email,
    empresa: texto(cuerpo.company, 160),
    telefono: texto(cuerpo.phone, 40),
    conocio: normalizarConocio(texto(cuerpo.source, 60)),
    intereses,
    mensaje,
    idioma: cuerpo.lang === "en" ? "en" : cuerpo.lang === "es" ? "es" : null,
  }
}

// Límites contra spam: 3 consultas por email y 30 en total por hora.
const POR_EMAIL_HORA = 3
const TOTAL_HORA = 30

export async function guardarConsulta(
  admin: SupabaseClient,
  c: ConsultaEntrante
): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string }> {
  const haceUnaHora = new Date(Date.now() - 3_600_000).toISOString()
  const [porEmail, total] = await Promise.all([
    admin
      .from("consultas_web")
      .select("id", { count: "exact", head: true })
      .eq("email", c.email)
      .gte("created_at", haceUnaHora),
    admin.from("consultas_web").select("id", { count: "exact", head: true }).gte("created_at", haceUnaHora),
  ])
  if ((porEmail.count ?? 0) >= POR_EMAIL_HORA || (total.count ?? 0) >= TOTAL_HORA) {
    return { ok: false, status: 429, error: "Demasiados mensajes, probá más tarde" }
  }

  const { data, error } = await admin
    .from("consultas_web")
    .insert({
      nombre: c.nombre,
      email: c.email,
      empresa: c.empresa,
      telefono: c.telefono ?? null,
      conocio: c.conocio ?? null,
      intereses: c.intereses,
      mensaje: c.mensaje,
      idioma: c.idioma,
      origen: c.origen ?? "formulario",
    })
    .select("id")
    .single<{ id: string }>()
  if (error || !data) return { ok: false, status: 500, error: "No se pudo guardar" }
  return { ok: true, id: data.id }
}

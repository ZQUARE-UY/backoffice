import "server-only"

import { createHash, randomBytes } from "node:crypto"

import { createAdminClient } from "@/lib/supabase/admin"

// OAuth 2.1 para el MCP server (claude.ai web/celular). El backoffice es el
// authorization server: clientes públicos con PKCE S256 obligatorio, tokens
// opacos guardados hasheados, refresh token con rotación.

export const RUTA_AUTORIZAR = "/oauth/autorizar"
export const RUTA_TOKEN = "/api/oauth/token"
export const RUTA_REGISTRO = "/api/oauth/registro"
export const RUTA_MCP = "/api/mcp/mcp"
export const SCOPE_BACKOFFICE = "backoffice"

const VIDA_CODIGO_MIN = 10
const VIDA_ACCESS_DIAS = 30
const VIDA_REFRESH_DIAS = 180

export function hashToken(valor: string): string {
  return createHash("sha256").update(valor).digest("hex")
}

function tokenOpaco(prefijo: string): string {
  return `${prefijo}_${randomBytes(32).toString("hex")}`
}

// Origin público real detrás del proxy de Vercel (mismo criterio que
// /auth/callback). El issuer y todos los endpoints se derivan de acá.
export function originPublico(req: Request): string {
  const host = req.headers.get("x-forwarded-host")
  const proto = req.headers.get("x-forwarded-proto") ?? "https"
  return host ? `${proto}://${host}` : new URL(req.url).origin
}

export function esRedirectUriValida(uri: string): boolean {
  try {
    const u = new URL(uri)
    if (u.protocol === "https:") return true
    // Solo para desarrollo y clientes locales (inspector, Claude Desktop).
    return (
      u.protocol === "http:" &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1")
    )
  } catch {
    return false
  }
}

// ── Clientes (registro dinámico, RFC 7591) ─────────────────────────────────

export async function registrarCliente(
  nombre: string,
  redirectUris: string[]
): Promise<string> {
  const clientId = tokenOpaco("mcpc")
  const supabase = createAdminClient()
  const { error } = await supabase.from("mcp_oauth_clientes").insert({
    client_id: clientId,
    nombre,
    redirect_uris: redirectUris,
  })
  if (error) throw new Error(error.message)
  return clientId
}

export async function buscarCliente(clientId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("mcp_oauth_clientes")
    .select("client_id, nombre, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle()
  return data
}

// ── Códigos de autorización (PKCE S256) ────────────────────────────────────

export async function emitirCodigo(entrada: {
  clientId: string
  socioEmail: string
  redirectUri: string
  codeChallenge: string
  scope?: string
}): Promise<string> {
  const codigo = tokenOpaco("mcpa")
  const supabase = createAdminClient()
  const { error } = await supabase.from("mcp_oauth_codigos").insert({
    codigo_hash: hashToken(codigo),
    client_id: entrada.clientId,
    socio_email: entrada.socioEmail,
    redirect_uri: entrada.redirectUri,
    code_challenge: entrada.codeChallenge,
    scope: entrada.scope ?? SCOPE_BACKOFFICE,
    expira_at: new Date(Date.now() + VIDA_CODIGO_MIN * 60_000).toISOString(),
  })
  if (error) throw new Error(error.message)
  return codigo
}

function desafioPkce(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url")
}

export type TokensEmitidos = {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
}

// Canjea un código por tokens. El código es de un solo uso: se borra al
// canjearlo (válido o no), así un código robado no se puede reintentar.
export async function canjearCodigo(entrada: {
  codigo: string
  clientId: string
  redirectUri: string
  codeVerifier: string
}): Promise<TokensEmitidos | { error: string }> {
  const supabase = createAdminClient()
  const { data: fila } = await supabase
    .from("mcp_oauth_codigos")
    .delete()
    .eq("codigo_hash", hashToken(entrada.codigo))
    .select()
    .maybeSingle()

  if (!fila) return { error: "código inválido o ya usado" }
  if (new Date(fila.expira_at) < new Date()) return { error: "código vencido" }
  if (fila.client_id !== entrada.clientId)
    return { error: "el código pertenece a otro cliente" }
  if (fila.redirect_uri !== entrada.redirectUri)
    return { error: "redirect_uri no coincide con la del código" }
  if (desafioPkce(entrada.codeVerifier) !== fila.code_challenge)
    return { error: "verificación PKCE fallida" }

  return emitirTokens(fila.client_id, fila.socio_email, fila.scope)
}

// ── Tokens de acceso y refresh ─────────────────────────────────────────────

async function emitirTokens(
  clientId: string,
  socioEmail: string,
  scope: string | null
): Promise<TokensEmitidos> {
  const access = tokenOpaco("mcpt")
  const refresh = tokenOpaco("mcpr")
  const supabase = createAdminClient()
  const { error } = await supabase.from("mcp_oauth_tokens").insert({
    client_id: clientId,
    socio_email: socioEmail,
    access_hash: hashToken(access),
    refresh_hash: hashToken(refresh),
    access_expira_at: new Date(
      Date.now() + VIDA_ACCESS_DIAS * 86_400_000
    ).toISOString(),
    refresh_expira_at: new Date(
      Date.now() + VIDA_REFRESH_DIAS * 86_400_000
    ).toISOString(),
  })
  if (error) throw new Error(error.message)
  return {
    access_token: access,
    refresh_token: refresh,
    expires_in: VIDA_ACCESS_DIAS * 86_400,
    scope: scope ?? SCOPE_BACKOFFICE,
  }
}

// Rotación: el refresh usado se invalida (se borra la fila entera, con su
// access token) y se emite un par nuevo.
export async function renovarTokens(
  refreshToken: string,
  clientId: string
): Promise<TokensEmitidos | { error: string }> {
  const supabase = createAdminClient()
  const { data: fila } = await supabase
    .from("mcp_oauth_tokens")
    .delete()
    .eq("refresh_hash", hashToken(refreshToken))
    .select()
    .maybeSingle()

  if (!fila) return { error: "refresh token inválido o ya usado" }
  if (fila.revocado_at) return { error: "token revocado" }
  if (fila.client_id !== clientId)
    return { error: "el refresh token pertenece a otro cliente" }
  if (fila.refresh_expira_at && new Date(fila.refresh_expira_at) < new Date())
    return { error: "refresh token vencido" }

  return emitirTokens(fila.client_id, fila.socio_email, SCOPE_BACKOFFICE)
}

// Devuelve el email del socio si el access token es válido; null si no.
export async function socioDelAccessToken(
  token: string
): Promise<string | null> {
  const supabase = createAdminClient()
  const ahora = new Date().toISOString()
  const { data } = await supabase
    .from("mcp_oauth_tokens")
    .update({ ultimo_uso_at: ahora })
    .eq("access_hash", hashToken(token))
    .is("revocado_at", null)
    .gt("access_expira_at", ahora)
    .select("socio_email")
    .maybeSingle()
  return data?.socio_email ?? null
}

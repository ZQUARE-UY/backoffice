import { NextResponse } from "next/server"

import { canjearCodigo, renovarTokens } from "@/lib/mcp-oauth"

// Token endpoint (OAuth 2.1): canje de authorization codes (con PKCE) y
// renovación por refresh token (con rotación). Clientes públicos, sin secret.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

function errorToken(codigo: string, descripcion: string, status = 400) {
  return NextResponse.json(
    { error: codigo, error_description: descripcion },
    { status, headers: CORS }
  )
}

export async function POST(req: Request) {
  let params: URLSearchParams
  const contentType = req.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) {
    params = new URLSearchParams(
      Object.entries((await req.json().catch(() => ({}))) as Record<string, string>)
    )
  } else {
    params = new URLSearchParams(await req.text())
  }

  const grantType = params.get("grant_type")
  const clientId = params.get("client_id")
  if (!clientId) return errorToken("invalid_request", "falta client_id")

  if (grantType === "authorization_code") {
    const codigo = params.get("code")
    const redirectUri = params.get("redirect_uri")
    const codeVerifier = params.get("code_verifier")
    if (!codigo || !redirectUri || !codeVerifier) {
      return errorToken(
        "invalid_request",
        "faltan code, redirect_uri o code_verifier"
      )
    }
    const resultado = await canjearCodigo({
      codigo,
      clientId,
      redirectUri,
      codeVerifier,
    })
    if ("error" in resultado) {
      return errorToken("invalid_grant", resultado.error)
    }
    return NextResponse.json(
      { ...resultado, token_type: "Bearer" },
      { headers: { ...CORS, "Cache-Control": "no-store" } }
    )
  }

  if (grantType === "refresh_token") {
    const refresh = params.get("refresh_token")
    if (!refresh) return errorToken("invalid_request", "falta refresh_token")
    const resultado = await renovarTokens(refresh, clientId)
    if ("error" in resultado) {
      return errorToken("invalid_grant", resultado.error)
    }
    return NextResponse.json(
      { ...resultado, token_type: "Bearer" },
      { headers: { ...CORS, "Cache-Control": "no-store" } }
    )
  }

  return errorToken(
    "unsupported_grant_type",
    "solo authorization_code y refresh_token"
  )
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

import { NextResponse } from "next/server"

import {
  RUTA_AUTORIZAR,
  RUTA_REGISTRO,
  RUTA_TOKEN,
  SCOPE_BACKOFFICE,
  originPublico,
} from "@/lib/mcp-oauth"

// Metadata del authorization server (RFC 8414). El catch-all opcional cubre
// también la variante con sufijo de ruta que consultan algunos clientes
// (/.well-known/oauth-authorization-server/api/mcp/mcp).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, mcp-protocol-version",
}

export function GET(req: Request) {
  const origin = originPublico(req)
  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}${RUTA_AUTORIZAR}`,
      token_endpoint: `${origin}${RUTA_TOKEN}`,
      registration_endpoint: `${origin}${RUTA_REGISTRO}`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [SCOPE_BACKOFFICE],
    },
    { headers: CORS }
  )
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

import { NextResponse } from "next/server"

import { RUTA_MCP, SCOPE_BACKOFFICE, originPublico } from "@/lib/mcp-oauth"

// Metadata del protected resource (RFC 9728): le dice al cliente MCP qué
// authorization server protege /api/mcp/mcp. El catch-all opcional cubre la
// variante con sufijo (/.well-known/oauth-protected-resource/api/mcp/mcp).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, mcp-protocol-version",
}

export function GET(req: Request) {
  const origin = originPublico(req)
  return NextResponse.json(
    {
      resource: `${origin}${RUTA_MCP}`,
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
      scopes_supported: [SCOPE_BACKOFFICE],
    },
    { headers: CORS }
  )
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

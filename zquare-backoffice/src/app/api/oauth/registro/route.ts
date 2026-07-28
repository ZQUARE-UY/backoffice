import { NextResponse } from "next/server"

import { esRedirectUriValida, registrarCliente } from "@/lib/mcp-oauth"

// Registro dinámico de clientes OAuth (RFC 7591). Cualquier cliente MCP se
// puede registrar (así funciona el protocolo: claude.ai lo hace solo), pero
// un client_id no da acceso a nada: para conseguir tokens hace falta que un
// socio apruebe el consentimiento con su sesión de Google en /oauth/autorizar.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

function errorRegistro(descripcion: string) {
  return NextResponse.json(
    { error: "invalid_client_metadata", error_description: descripcion },
    { status: 400, headers: CORS }
  )
}

export async function POST(req: Request) {
  let cuerpo: {
    client_name?: string
    redirect_uris?: string[]
    token_endpoint_auth_method?: string
    grant_types?: string[]
  }
  try {
    cuerpo = await req.json()
  } catch {
    return errorRegistro("el cuerpo debe ser JSON")
  }

  const redirectUris = cuerpo.redirect_uris
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return errorRegistro("falta redirect_uris")
  }
  if (!redirectUris.every((u) => typeof u === "string" && esRedirectUriValida(u))) {
    return errorRegistro(
      "las redirect_uris deben ser https (o http://localhost para desarrollo)"
    )
  }

  const nombre =
    typeof cuerpo.client_name === "string" && cuerpo.client_name.trim()
      ? cuerpo.client_name.trim().slice(0, 120)
      : new URL(redirectUris[0]).hostname

  const clientId = await registrarCliente(nombre, redirectUris)

  return NextResponse.json(
    {
      client_id: clientId,
      client_name: nombre,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201, headers: CORS }
  )
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { buscarCliente, SCOPE_BACKOFFICE } from "@/lib/mcp-oauth"
import { esEmailAutorizado } from "@/lib/socios"
import { createClient } from "@/lib/supabase/server"

import { aprobarAcceso, rechazarAcceso } from "./actions"

// Pantalla de consentimiento OAuth del MCP. Llega acá un cliente MCP
// (claude.ai) con client_id + PKCE; el socio logueado aprueba o rechaza.
// El middleware ya exige sesión: sin login se pasa por /login?next=...

function ErrorOAuth({ mensaje }: { mensaje: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl tracking-tight">
            Solicitud inválida
          </CardTitle>
          <CardDescription>{mensaje}</CardDescription>
        </CardHeader>
      </Card>
    </main>
  )
}

export default async function AutorizarPage({
  searchParams,
}: {
  searchParams: Promise<{
    client_id?: string
    redirect_uri?: string
    response_type?: string
    state?: string
    code_challenge?: string
    code_challenge_method?: string
    scope?: string
  }>
}) {
  const params = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email || !esEmailAutorizado(user.email)) {
    redirect("/login")
  }

  if (!params.client_id || !params.redirect_uri) {
    return <ErrorOAuth mensaje="Faltan client_id o redirect_uri." />
  }

  const cliente = await buscarCliente(params.client_id)
  if (!cliente) {
    return <ErrorOAuth mensaje="El cliente no está registrado." />
  }
  if (!cliente.redirect_uris.includes(params.redirect_uri)) {
    // Nunca redirigir a una URI no registrada: se corta acá.
    return <ErrorOAuth mensaje="La redirect_uri no coincide con la registrada." />
  }

  // Errores de protocolo: se avisan al cliente por su redirect registrada.
  const errorProtocolo = !params.code_challenge
    ? "code_challenge (PKCE) es obligatorio"
    : params.code_challenge_method !== "S256"
      ? "solo se soporta code_challenge_method=S256"
      : params.response_type !== "code"
        ? "solo se soporta response_type=code"
        : null
  if (errorProtocolo) {
    const destino = new URL(params.redirect_uri)
    destino.searchParams.set("error", "invalid_request")
    destino.searchParams.set("error_description", errorProtocolo)
    if (params.state) destino.searchParams.set("state", params.state)
    redirect(destino.toString())
  }

  const campos = {
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    state: params.state ?? "",
    code_challenge: params.code_challenge!,
    scope: params.scope ?? SCOPE_BACKOFFICE,
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl tracking-tight">ZQUARE</CardTitle>
          <CardDescription>
            <span className="font-medium text-foreground">{cliente.nombre}</span>{" "}
            quiere conectarse al backoffice con tu cuenta{" "}
            <span className="font-medium text-foreground">{user.email}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Va a poder consultar clientes, proyectos, documentos, decisiones y
            finanzas, y registrar decisiones y movimientos a tu nombre. No puede
            editar ni borrar nada.
          </p>
        </CardContent>
        <CardFooter className="flex gap-3">
          <form action={rechazarAcceso} className="flex-1">
            {Object.entries(campos).map(([nombre, valor]) => (
              <input key={nombre} type="hidden" name={nombre} value={valor} />
            ))}
            <Button type="submit" variant="outline" className="w-full">
              Cancelar
            </Button>
          </form>
          <form action={aprobarAcceso} className="flex-1">
            {Object.entries(campos).map(([nombre, valor]) => (
              <input key={nombre} type="hidden" name={nombre} value={valor} />
            ))}
            <Button type="submit" className="w-full">
              Autorizar
            </Button>
          </form>
        </CardFooter>
      </Card>
    </main>
  )
}

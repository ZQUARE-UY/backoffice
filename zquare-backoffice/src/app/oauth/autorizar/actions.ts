"use server"

import { redirect } from "next/navigation"

import { buscarCliente, emitirCodigo } from "@/lib/mcp-oauth"
import { esEmailAutorizado } from "@/lib/socios"
import { createClient } from "@/lib/supabase/server"

// Acciones del consentimiento OAuth. Los valores vienen de inputs ocultos del
// form, así que acá se re-valida TODO (cliente, redirect_uri, sesión): un
// form manipulado no puede emitir códigos para redirects no registradas.

async function validar(formData: FormData) {
  const clientId = String(formData.get("client_id") ?? "")
  const redirectUri = String(formData.get("redirect_uri") ?? "")
  const state = formData.get("state") ? String(formData.get("state")) : null

  const cliente = await buscarCliente(clientId)
  if (!cliente || !cliente.redirect_uris.includes(redirectUri)) {
    throw new Error("cliente o redirect_uri inválidos")
  }

  const destino = new URL(redirectUri)
  if (state) destino.searchParams.set("state", state)
  return { clientId, redirectUri, destino }
}

export async function aprobarAcceso(formData: FormData) {
  const { clientId, redirectUri, destino } = await validar(formData)
  const codeChallenge = String(formData.get("code_challenge") ?? "")
  const scope = formData.get("scope") ? String(formData.get("scope")) : undefined
  if (!codeChallenge) throw new Error("falta code_challenge")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email || !esEmailAutorizado(user.email)) {
    throw new Error("sesión inválida")
  }

  const codigo = await emitirCodigo({
    clientId,
    socioEmail: user.email.toLowerCase(),
    redirectUri,
    codeChallenge,
    scope,
  })
  destino.searchParams.set("code", codigo)
  redirect(destino.toString())
}

export async function rechazarAcceso(formData: FormData) {
  const { destino } = await validar(formData)
  destino.searchParams.set("error", "access_denied")
  redirect(destino.toString())
}

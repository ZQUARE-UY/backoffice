import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/"

  // Detrás del proxy de Vercel, `origin` puede no reflejar el host público.
  const forwardedHost = request.headers.get("x-forwarded-host")
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https"
  const baseUrl = forwardedHost ? `${forwardedProto}://${forwardedHost}` : origin

  // Errores que devuelve el propio proveedor OAuth / Supabase.
  const oauthError = searchParams.get("error")
  const oauthErrorDesc = searchParams.get("error_description")
  if (oauthError) {
    const url = new URL(`${baseUrl}/login`)
    url.searchParams.set("error", "auth")
    url.searchParams.set("detalle", oauthErrorDesc ?? oauthError)
    return NextResponse.redirect(url)
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${baseUrl}${next}`)
    }
    const url = new URL(`${baseUrl}/login`)
    url.searchParams.set("error", "auth")
    url.searchParams.set("detalle", error.message)
    return NextResponse.redirect(url)
  }

  const url = new URL(`${baseUrl}/login`)
  url.searchParams.set("error", "auth")
  url.searchParams.set("detalle", "no se recibió el código de autorización")
  return NextResponse.redirect(url)
}

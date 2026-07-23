import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { esEmailAutorizado } from "@/lib/socios"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const esRutaPublica =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/acceso-denegado")

  if (!user && !esRutaPublica) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  // Usuario autenticado pero fuera de la allowlist de socios: fuera.
  if (user && !esEmailAutorizado(user.email)) {
    if (!path.startsWith("/acceso-denegado") && !path.startsWith("/auth")) {
      await supabase.auth.signOut()
      const url = request.nextUrl.clone()
      url.pathname = "/acceso-denegado"
      return NextResponse.redirect(url)
    }
  }

  if (
    user &&
    esEmailAutorizado(user.email) &&
    (path.startsWith("/login") || path.startsWith("/acceso-denegado"))
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

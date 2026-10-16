import { type NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/middleware"

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // api/mcp queda afuera: usa su propia auth (token bearer por socio),
    // no la sesión de Supabase. api/publico también: la llama la web
    // pública sin sesión (cada visita manda eventos) y se protege sola.
    "/((?!api/mcp|api/publico|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"

export type SocioActual = { id: string; nombre: string; email: string }

// Fila de `socios` del usuario logueado. Null si por algún motivo no está
// vinculado todavía.
//
// Con `cache` porque el layout protegido y las páginas lo piden en el mismo
// request: sin esto cada uno vuelve a pegarle a Auth y a `socios`.
export const socioActual = cache(async function socioActual(): Promise<SocioActual | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from("socios")
    .select("id, nombre, email")
    .eq("auth_user_id", user.id)
    .maybeSingle()

  return (data as SocioActual | null) ?? null
})

// Id del socio logueado, para poblar `created_by`.
export async function idSocioActual(): Promise<string | null> {
  return (await socioActual())?.id ?? null
}

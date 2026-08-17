import { cache } from "react"

import { createClient } from "@/lib/supabase/server"

// Devuelve el id de la fila en `socios` del usuario logueado, para poblar
// `created_by`. Null si por algún motivo no está vinculado todavía.
//
// Con `cache` porque el layout protegido y las páginas lo piden en el mismo
// request: sin esto cada uno vuelve a pegarle a Auth y a `socios`.
export const idSocioActual = cache(async function idSocioActual(): Promise<
  string | null
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from("socios")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle()

  return data?.id ?? null
})

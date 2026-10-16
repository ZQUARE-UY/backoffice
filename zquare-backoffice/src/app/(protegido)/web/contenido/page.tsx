import type { Bloque, SocioWeb } from "@/lib/contenido-web"
import { createClient } from "@/lib/supabase/server"

import { VistaContenido } from "./vista-contenido"

export const metadata = { title: "Contenido · Web" }

// Web → Contenido: trae los bloques y los socios; la vista está en
// vista-contenido.tsx.
export default async function ContenidoWebPage() {
  const supabase = await createClient()
  const [{ data: bloques }, { data: socios }] = await Promise.all([
    supabase
      .from("contenido_web")
      .select("id, tipo, orden, publicado, es, en, nombre, empresa")
      .is("deleted_at", null)
      .order("orden")
      .order("created_at"),
    supabase
      .from("socios")
      .select("id, nombre, web_visible, web_orden, web_cargo_es, web_cargo_en")
      .is("deleted_at", null)
      .order("web_orden")
      .order("nombre"),
  ])
  return <VistaContenido bloques={(bloques ?? []) as Bloque[]} socios={(socios ?? []) as SocioWeb[]} />
}

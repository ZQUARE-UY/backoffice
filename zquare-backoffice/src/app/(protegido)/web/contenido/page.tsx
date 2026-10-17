import { CLAVE_CONFIG_SECCIONES, leerSecciones, type Bloque, type SocioWeb } from "@/lib/contenido-web"
import { createClient } from "@/lib/supabase/server"

import { EditorWeb } from "./editor-web"

export const metadata = { title: "Contenido · Web" }

// La web que muestra la vista previa: en desarrollo, la local
// (python -m http.server 4321 en el repo de la web).
const WEB_URL = process.env.NODE_ENV === "development" ? "http://localhost:4321" : "https://zquare.uy"

// Web → Contenido: trae los bloques y los socios; el editor está en
// editor-web.tsx.
export default async function ContenidoWebPage() {
  const supabase = await createClient()
  const [{ data: bloques }, { data: socios }, { data: config }] = await Promise.all([
    supabase
      .from("contenido_web")
      .select("id, tipo, orden, publicado, es, en, nombre, empresa")
      .is("deleted_at", null)
      .order("orden")
      .order("created_at"),
    supabase
      .from("socios")
      .select("id, nombre, web_visible, web_orden, web_cargo_es, web_cargo_en, web_foto_url")
      .is("deleted_at", null)
      .order("web_orden")
      .order("nombre"),
    supabase.from("configuracion").select("valor").eq("clave", CLAVE_CONFIG_SECCIONES).maybeSingle<{ valor: unknown }>(),
  ])
  return (
    <EditorWeb
      bloques={(bloques ?? []) as Bloque[]}
      socios={(socios ?? []) as SocioWeb[]}
      secciones={leerSecciones(config?.valor)}
      webUrl={WEB_URL}
    />
  )
}

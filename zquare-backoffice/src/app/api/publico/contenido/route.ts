import { NextResponse } from "next/server"

import { origenPermitido } from "@/lib/consultas-web"
import { CLAVE_CONFIG_SECCIONES, contenidoPublico, leerSecciones, type Bloque, type SocioWeb } from "@/lib/contenido-web"
import { createAdminClient } from "@/lib/supabase/admin"

// Contenido editable de zquare.uy (Web → Contenido en el backoffice). Público
// y de solo lectura: es lo mismo que cualquiera ve en la web. Lo cachea el
// CDN de Vercel un minuto, así un cambio tarda a lo sumo eso en verse.

function cors(origen: string | null): Record<string, string> {
  const permitido = origenPermitido(origen)
  return {
    Vary: "Origin",
    ...(permitido ? { "Access-Control-Allow-Origin": permitido } : {}),
  }
}

export async function GET(req: Request) {
  const encabezados = cors(req.headers.get("origin"))
  try {
    const admin = createAdminClient()
    const [bloques, socios, config] = await Promise.all([
      admin
        .from("contenido_web")
        .select("id, tipo, orden, publicado, es, en, nombre, empresa")
        .eq("publicado", true)
        .is("deleted_at", null),
      admin
        .from("socios")
        .select("id, nombre, web_visible, web_orden, web_cargo_es, web_cargo_en, web_foto_url")
        .eq("web_visible", true)
        .is("deleted_at", null),
      admin.from("configuracion").select("valor").eq("clave", CLAVE_CONFIG_SECCIONES).maybeSingle<{ valor: unknown }>(),
    ])
    if (bloques.error || socios.error) throw new Error(bloques.error?.message ?? socios.error?.message)

    const contenido = contenidoPublico(
      (bloques.data ?? []) as Bloque[],
      (socios.data ?? []) as SocioWeb[],
      leerSecciones(config.data?.valor)
    )
    return NextResponse.json(contenido, {
      headers: { ...encabezados, "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" },
    })
  } catch (e) {
    console.error("No se pudo armar el contenido de la web:", e)
    // Sin contenido la web usa el suyo; que no quede cacheado el error.
    return NextResponse.json({}, { status: 500, headers: { ...encabezados, "Cache-Control": "no-store" } })
  }
}

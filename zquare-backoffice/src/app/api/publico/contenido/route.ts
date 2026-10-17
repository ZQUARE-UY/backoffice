import { NextResponse } from "next/server"

import { origenPermitido } from "@/lib/consultas-web"
import { cargarContenidoPublico } from "@/lib/contenido-web"
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
    const contenido = await cargarContenidoPublico(createAdminClient())
    return NextResponse.json(contenido, {
      headers: { ...encabezados, "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" },
    })
  } catch (e) {
    console.error("No se pudo armar el contenido de la web:", e)
    // Sin contenido la web usa el suyo; que no quede cacheado el error.
    return NextResponse.json({}, { status: 500, headers: { ...encabezados, "Cache-Control": "no-store" } })
  }
}

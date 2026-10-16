import { NextResponse } from "next/server"

import { encabezadosCors, guardarConsulta, origenPermitido, validarConsulta } from "@/lib/consultas-web"
import { createAdminClient } from "@/lib/supabase/admin"

// Formulario de contacto de zquare.uy. Público (sin sesión): lo que lo
// protege es el origen permitido, la trampa para bots y el límite de envíos
// por hora (ver lib/consultas-web.ts). La consulta entra como "nueva" en la
// sección Web del backoffice.

export async function OPTIONS(req: Request) {
  const origen = req.headers.get("origin")
  return new Response(null, { status: origenPermitido(origen) ? 204 : 403, headers: encabezadosCors(origen) })
}

export async function POST(req: Request) {
  const origen = req.headers.get("origin")
  const cors = encabezadosCors(origen)
  if (!origenPermitido(origen)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: cors })
  }

  let cuerpo: Record<string, unknown>
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: "El cuerpo debe ser JSON" }, { status: 400, headers: cors })
  }

  // Trampa para bots: el campo oculto "botcheck" solo lo llena un bot. Se le
  // responde como si hubiera salido bien para que no insista.
  if (cuerpo.botcheck) {
    return NextResponse.json({ ok: true }, { headers: cors })
  }

  const consulta = validarConsulta(cuerpo)
  if ("error" in consulta) {
    return NextResponse.json({ error: consulta.error }, { status: 400, headers: cors })
  }

  const resultado = await guardarConsulta(createAdminClient(), consulta)
  if (!resultado.ok) {
    if (resultado.status === 500) console.error("No se pudo guardar una consulta de la web")
    return NextResponse.json({ error: resultado.error }, { status: resultado.status, headers: cors })
  }
  return NextResponse.json({ ok: true }, { headers: cors })
}

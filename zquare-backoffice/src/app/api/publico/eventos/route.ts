import { esRobot, dispositivo, filasDeLote, hashVisitante } from "@/lib/eventos-web"
import { origenPermitido } from "@/lib/consultas-web"
import { hoyUruguay } from "@/lib/finanzas"
import { createAdminClient } from "@/lib/supabase/admin"

// Métricas propias de zquare.uy. La web manda lotes de eventos con
// navigator.sendBeacon como text/plain (pedido "simple": sin preflight de
// CORS y sin respuesta que leer). Siempre responde 204, también si descarta
// el lote, para no darle pistas a nadie.

export async function POST(req: Request) {
  const vacio = new Response(null, { status: 204 })
  if (!origenPermitido(req.headers.get("origin"))) return vacio

  const ua = req.headers.get("user-agent") ?? ""
  if (esRobot(ua)) return vacio

  let cuerpo: Record<string, unknown>
  try {
    const crudo = await req.text()
    if (crudo.length > 20_000) return vacio
    cuerpo = JSON.parse(crudo)
  } catch {
    return vacio
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? ""
  const filas = filasDeLote(cuerpo, {
    visitante: hashVisitante(ip, ua, hoyUruguay()),
    pais: req.headers.get("x-vercel-ip-country"),
    dispositivo: dispositivo(ua, cuerpo.w),
  })
  if (filas.length === 0) return vacio

  try {
    const { error } = await createAdminClient().from("eventos_web").insert(filas)
    if (error) console.error("No se pudieron guardar eventos de la web:", error.message)
  } catch (e) {
    console.error("No se pudieron guardar eventos de la web:", e)
  }
  return vacio
}

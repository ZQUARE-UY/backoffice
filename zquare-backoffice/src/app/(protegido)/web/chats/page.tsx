import type Anthropic from "@anthropic-ai/sdk"

import { mensajesVisibles, type Incidente, type TurnoInfo } from "@/lib/chat-web"
import { CLAVE_CONFIG_CHAT, leerConfigChat } from "@/lib/chat-web-config"
import { inicioDelMes } from "@/lib/uso-api-resumen"
import { createClient } from "@/lib/supabase/server"

import { ConfigurarChat } from "./configurar-chat"
import { FILTROS_CHAT, VistaChats, type ChatLista, type EventoRecorrido, type Hermano } from "./vista-chats"

export const metadata = { title: "Chats · Web" }

const COLUMNAS_LISTA =
  "id, turnos, idioma, dispositivo, pais, estado, etiquetas, valoracion, created_at, updated_at, consulta_id, primero:mensajes->0->>content, consultas_web(nombre)"

type Completo = {
  mensajes: Anthropic.MessageParam[]
  costo_usd: number
  ruta: string | null
  visitante: string | null
  referente: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  ciudad: string | null
  turnos_info: TurnoInfo[]
  incidentes: Incidente[]
  notas: string | null
}

// Conversaciones del chat con IA de zquare.uy: las últimas 100 del filtro
// (`?estado=`) y la elegida (`?chat=<id>`), con lo que se vio en la web, de
// dónde vino y qué hizo en la web ese día (eventos_web con el mismo hash de
// visitante). La vista está en vista-chats.tsx.
export default async function ChatsWebPage({ searchParams }: { searchParams: Promise<{ chat?: string; estado?: string }> }) {
  const { chat: elegidoParam, estado: estadoParam } = await searchParams
  const filtro = FILTROS_CHAT.find((f) => f.valor === estadoParam)?.valor ?? "nuevo"
  const supabase = await createClient()

  let lista = supabase
    .from("chats_web")
    .select(COLUMNAS_LISTA)
    .is("deleted_at", null)
    .gt("turnos", 0)
    .order("updated_at", { ascending: false })
    .limit(100)
  if (filtro !== "todos") lista = lista.eq("estado", filtro)

  const [{ data }, { data: fila }, { data: conEtiquetas }, gastoMes] = await Promise.all([
    lista,
    supabase.from("configuracion").select("valor").eq("clave", CLAVE_CONFIG_CHAT).maybeSingle<{ valor: unknown }>(),
    supabase.from("chats_web").select("etiquetas").is("deleted_at", null).neq("etiquetas", "{}").limit(500),
    gastoDelMes(),
  ])
  const config = leerConfigChat(fila?.valor)
  const chats = (data ?? []) as unknown as ChatLista[]
  const etiquetasUsadas = [...new Set((conEtiquetas ?? []).flatMap((c: { etiquetas: string[] }) => c.etiquetas))].sort()

  // La elegida puede no estar en el filtro (se acaba de archivar): se busca
  // igual, así no salta a otra conversación.
  let base = chats.find((c) => c.id === elegidoParam) ?? null
  if (!base && elegidoParam && /^[0-9a-f-]{36}$/i.test(elegidoParam)) {
    const { data: suelta } = await supabase
      .from("chats_web")
      .select(COLUMNAS_LISTA)
      .eq("id", elegidoParam)
      .is("deleted_at", null)
      .maybeSingle()
    base = (suelta as unknown as ChatLista) ?? null
  }
  base ??= chats[0] ?? null

  let elegido = null
  if (base) {
    const { data: completo } = await supabase
      .from("chats_web")
      .select(
        "mensajes, costo_usd, ruta, visitante, referente, utm_source, utm_medium, utm_campaign, ciudad, turnos_info, incidentes, notas"
      )
      .eq("id", base.id)
      .maybeSingle<Completo>()
    if (completo) {
      const { recorrido, hermanos } = await delMismoVisitante(base, completo.visitante)
      // Chats viejos (antes de guardar el origen): lo que dice la primera
      // visita del día.
      const primera = recorrido.find((e) => e.evento === "page_view")
      elegido = {
        ...base,
        mensajes: mensajesVisibles(completo.mensajes),
        costoUsd: Number(completo.costo_usd),
        ruta: completo.ruta,
        origen: {
          referente: completo.referente ?? primera?.referente ?? null,
          utm_source: completo.utm_source ?? primera?.utm_source ?? null,
          utm_medium: completo.utm_medium ?? primera?.utm_medium ?? null,
          utm_campaign: completo.utm_campaign ?? primera?.utm_campaign ?? null,
        },
        pais: base.pais ?? primera?.pais ?? null,
        ciudad: completo.ciudad,
        turnosInfo: completo.turnos_info ?? [],
        incidentes: completo.incidentes ?? [],
        notas: completo.notas,
        recorrido,
        hermanos,
      }
    }
  }

  return (
    <VistaChats
      chats={chats}
      filtro={filtro}
      elegido={elegido}
      elegidoEnUrl={!!elegidoParam}
      etiquetasUsadas={etiquetasUsadas}
      gastoMes={gastoMes}
      apagado={!config.activo}
      configurar={<ConfigurarChat config={config} configurado={!!process.env.ANTHROPIC_API_KEY} />}
    />
  )
}

// El hash de visitante cambia cada día (hora de Montevideo, UTC−3 fijo): lo
// que hizo en la web y sus otros chats son los de ese mismo día.
async function delMismoVisitante(chat: ChatLista, visitante: string | null) {
  if (!visitante) return { recorrido: [] as EventoRecorrido[], hermanos: [] as Hermano[] }
  const dia = new Date(new Date(chat.created_at).getTime() - 3 * 3_600_000).toISOString().slice(0, 10)
  const desde = `${dia}T00:00:00-03:00`
  const hasta = new Date(new Date(desde).getTime() + 86_400_000).toISOString()

  const supabase = await createClient()
  const [{ data: eventos }, { data: otros }] = await Promise.all([
    supabase
      .from("eventos_web")
      .select("evento, ruta, props, referente, utm_source, utm_medium, utm_campaign, pais, created_at")
      .eq("visitante", visitante)
      .gte("created_at", desde)
      .lt("created_at", hasta)
      .neq("evento", "scroll_depth")
      .order("created_at")
      .limit(300),
    supabase
      .from("chats_web")
      .select("id, created_at, turnos, consultas_web(nombre)")
      .eq("visitante", visitante)
      .neq("id", chat.id)
      .is("deleted_at", null)
      .gt("turnos", 0)
      .gte("created_at", desde)
      .lt("created_at", hasta)
      .order("created_at"),
  ])
  return {
    recorrido: (eventos ?? []) as EventoRecorrido[],
    hermanos: (otros ?? []) as unknown as Hermano[],
  }
}

// Gasto del chat en el mes calendario de Montevideo (uso_api).
async function gastoDelMes() {
  const supabase = await createClient()
  const { data } = await supabase.rpc("uso_api_por_mes", { desde: inicioDelMes() })
  const fila = ((data ?? []) as { funcion: string; llamadas: number; costo_usd: number }[]).find((f) => f.funcion === "chat_web")
  const { count } = await supabase
    .from("chats_web")
    .select("id", { count: "exact", head: true })
    .gt("turnos", 0)
    .gte("created_at", inicioDelMes())
  return { usd: Number(fila?.costo_usd ?? 0), chats: count ?? 0 }
}

import Link from "next/link"
import { ArrowLeftIcon, InboxIcon, MessagesSquareIcon, ThumbsDownIcon, ThumbsUpIcon, TriangleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Encabezado } from "@/components/zq/encabezado"
import type { Incidente, MensajeVisible, TurnoInfo } from "@/lib/chat-web"
import { fechaCorta, fechaRelativa, formatearNumero } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { cambiarEstadoChat, type EstadoChat } from "./actions"
import { GestionChat } from "./gestion-chat"

export type ChatLista = {
  id: string
  turnos: number
  idioma: "es" | "en" | null
  dispositivo: "movil" | "tablet" | "escritorio" | null
  pais: string | null
  estado: EstadoChat
  etiquetas: string[]
  valoracion: 1 | -1 | null
  created_at: string
  updated_at: string
  consulta_id: string | null
  primero: string | null
  consultas_web: { nombre: string } | null
}

// Lo que hizo el mismo visitante en la web ese día (eventos_web).
export type EventoRecorrido = {
  evento: string
  ruta: string | null
  props: Record<string, string | number>
  referente: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  pais: string | null
  created_at: string
}

// Otros chats del mismo visitante ese día.
export type Hermano = { id: string; created_at: string; turnos: number; consultas_web: { nombre: string } | null }

type ChatElegido = ChatLista & {
  mensajes: MensajeVisible[]
  // Lo que costó en la API de Claude (uso_api).
  costoUsd: number
  ruta: string | null
  origen: { referente: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null }
  ciudad: string | null
  turnosInfo: TurnoInfo[]
  incidentes: Incidente[]
  notas: string | null
  recorrido: EventoRecorrido[]
  hermanos: Hermano[]
}

export const FILTROS_CHAT: { valor: EstadoChat | "todos"; label: string }[] = [
  { valor: "nuevo", label: "Nuevos" },
  { valor: "revisado", label: "Revisados" },
  { valor: "archivado", label: "Archivados" },
  { valor: "todos", label: "Todos" },
]

const DISPOSITIVOS: Record<string, string> = { movil: "Celular", tablet: "Tablet", escritorio: "Computadora" }

const SECCIONES: Record<string, string> = {
  servicios: "Servicios",
  metodo: "Cómo trabajamos",
  equipo: "Equipo",
  testimonios: "Testimonios",
  contacto: "Contacto",
}

const INCIDENTES: Record<Incidente["tipo"], string> = {
  rechazo: "Rechazado por seguridad",
  error: "Error al responder",
  tope_mensajes: "Llegó al tope de mensajes",
}

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-UY", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit", hour12: false })

const regiones = new Intl.DisplayNames(["es"], { type: "region" })
function nombrePais(codigo: string | null): string | null {
  if (!codigo) return null
  try {
    return regiones.of(codigo.toUpperCase()) ?? codigo
  } catch {
    return codigo
  }
}

function duracion(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (min < 1) return "menos de un minuto"
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}

// Web → Chats: lo que la gente le pregunta al chat de zquare.uy. Lista a la
// izquierda (filtrada por estado, la más reciente arriba) y la conversación
// elegida a la derecha. Si dejó sus datos, la consulta está en la bandeja
// (Web → Consultas).
export function VistaChats({
  chats,
  filtro,
  elegido,
  elegidoEnUrl,
  etiquetasUsadas,
  apagado,
  configurar,
  gastoMes,
}: {
  chats: ChatLista[]
  filtro: EstadoChat | "todos"
  elegido: ChatElegido | null
  elegidoEnUrl: boolean
  // Para sugerir al etiquetar.
  etiquetasUsadas: string[]
  // El chat está apagado en Web → Chats → Configurar.
  apagado: boolean
  // Botón y diálogo de configuración (cliente), armado en page.tsx.
  configurar: React.ReactNode
  // Lo que lleva gastado el chat en el mes (USD) y cuántas conversaciones.
  gastoMes: { usd: number; chats: number }
}) {
  const conFiltro = (extra: string) => {
    const q = [filtro === "nuevo" ? "" : `estado=${filtro}`, extra].filter(Boolean).join("&")
    return `/web/chats${q ? `?${q}` : ""}`
  }

  return (
    <>
      <Encabezado
        titulo="Chats"
        rotulo="Web · zquare.uy"
        acciones={
          <>
            <span
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm text-muted-foreground"
              title="Gasto en la API de Claude este mes"
            >
              Este mes
              <strong className="zq-num text-foreground">US$ {formatearNumero(gastoMes.usd, 2)}</strong> ·{" "}
              {gastoMes.chats} {gastoMes.chats === 1 ? "chat" : "chats"}
            </span>
            {configurar}
          </>
        }
      />

      {apagado && (
        <p className="m-0 rounded-xl border border-dashed border-input px-4 py-3 text-muted-foreground">
          El chat está <strong className="text-foreground">apagado</strong>: la web no lo muestra. Prendelo en Configurar.
        </p>
      )}

      <nav className="zq-pildoras self-start" aria-label="Estado de los chats">
        {FILTROS_CHAT.map((f) => (
          <Link
            key={f.valor}
            href={f.valor === "nuevo" ? "/web/chats" : `/web/chats?estado=${f.valor}`}
            scroll={false}
            aria-current={f.valor === filtro ? "page" : undefined}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {chats.length === 0 && !elegido ? (
        <div className="rounded-xl border border-dashed border-input p-8 text-center text-muted-foreground">
          <p className="m-0 font-semibold text-foreground">No hay conversaciones acá</p>
          <p className="m-0 mt-1">Las que la gente tenga con el chat de zquare.uy aparecen en Nuevos.</p>
        </div>
      ) : (
        <div className="zq-chats flex min-h-[560px] flex-wrap items-stretch overflow-hidden rounded-xl border bg-card escritorio:min-h-0 escritorio:flex-nowrap">
          <nav
            aria-label="Conversaciones"
            className={cn(
              "flex min-w-[260px] flex-[0_1_340px] flex-col gap-0.5 border-r p-3 max-escritorio:flex-auto max-escritorio:border-r-0 escritorio:overflow-y-auto escritorio:overscroll-contain",
              elegidoEnUrl && "max-escritorio:hidden"
            )}
          >
            {chats.length === 0 && <p className="m-0 p-2 text-muted-foreground">No hay conversaciones en este filtro.</p>}
            {chats.map((c) => {
              const on = c.id === elegido?.id
              const extras = [
                `${c.turnos} ${c.turnos === 1 ? "mensaje" : "mensajes"}`,
                fechaRelativa(c.updated_at),
                c.pais,
                ...c.etiquetas.slice(0, 2),
              ].filter(Boolean)
              return (
                <Link
                  key={c.id}
                  href={conFiltro(`chat=${c.id}`)}
                  scroll={false}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex min-h-[56px] items-center gap-3 rounded-lg px-2.5 py-2 text-foreground no-underline hover:bg-muted",
                    on && "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-8 shrink-0 items-center justify-center rounded-lg",
                      c.consulta_id ? "bg-lima text-carbon" : "bg-muted text-foreground"
                    )}
                  >
                    {c.consulta_id ? <InboxIcon className="size-4" /> : <MessagesSquareIcon className="size-4" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cn("truncate", c.estado === "nuevo" ? "font-semibold" : "font-normal")}>
                      {c.consultas_web?.nombre ?? c.primero ?? "Conversación"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{extras.join(" · ")}</span>
                  </span>
                  {c.valoracion === 1 && <ThumbsUpIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Le gustó" />}
                  {c.valoracion === -1 && <ThumbsDownIcon className="size-3.5 shrink-0 text-destructive" aria-label="No le gustó" />}
                  {c.estado === "nuevo" && <span className="size-2 shrink-0 rounded-full bg-lima" aria-label="Nuevo" />}
                </Link>
              )
            })}
          </nav>

          {elegido ? (
            <Conversacion
              chat={elegido}
              soloEnEscritorio={!elegidoEnUrl}
              volver={conFiltro("")}
              hrefChat={(id) => conFiltro(`chat=${id}`)}
              etiquetasUsadas={etiquetasUsadas}
            />
          ) : null}
        </div>
      )}
    </>
  )
}

function Conversacion({
  chat: c,
  soloEnEscritorio,
  volver,
  hrefChat,
  etiquetasUsadas,
}: {
  chat: ChatElegido
  soloEnEscritorio: boolean
  volver: string
  hrefChat: (id: string) => string
  etiquetasUsadas: string[]
}) {
  const ultimo = c.turnosInfo.at(-1)
  const lugar = [c.ciudad, nombrePais(c.pais)].filter(Boolean).join(", ")
  const datos = [
    `${fechaCorta(c.created_at)} · ${hora(c.turnosInfo[0]?.en ?? c.created_at)}`,
    c.turnosInfo.length > 1 && ultimo ? duracion(new Date(ultimo.en).getTime() - new Date(c.turnosInfo[0].en).getTime()) : null,
    c.dispositivo ? DISPOSITIVOS[c.dispositivo] : null,
    lugar || null,
    c.idioma === "en" ? "En inglés" : null,
    `US$ ${formatearNumero(c.costoUsd, 4)}`,
  ].filter(Boolean)

  const { referente, utm_source, utm_medium, utm_campaign } = c.origen
  const campana = [utm_source, utm_medium, utm_campaign].filter(Boolean).join(" / ")
  const llego = campana ? `Campaña ${campana}` : referente ? `Desde ${referente}` : "Entrada directa"

  // Si no dejó datos pero el mismo visitante sí, en otro chat ese día.
  const posible = c.consultas_web ? null : c.hermanos.find((h) => h.consultas_web)?.consultas_web?.nombre

  const inicioChat = c.turnosInfo[0]?.en ?? c.created_at
  const recorrido = [
    ...c.recorrido.map((e) => ({ en: e.created_at, texto: describirEvento(e), chat: false })),
    { en: inicioChat, texto: "Abrió este chat", chat: true },
  ]
    .filter((e) => e.texto)
    .sort((a, b) => a.en.localeCompare(b.en))

  return (
    <section
      aria-label="Conversación"
      className={cn(
        "flex min-w-0 flex-[1_1_480px] flex-col gap-5 px-8 py-7 max-escritorio:px-4 escritorio:overflow-y-auto escritorio:overscroll-contain",
        soloEnEscritorio && "max-escritorio:hidden"
      )}
    >
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={volver} />} className="-ml-2 self-start escritorio:hidden">
        <ArrowLeftIcon data-icon="inline-start" />
        Todas las conversaciones
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 font-display text-[30px] leading-9 font-normal">
            {c.consultas_web?.nombre ?? (posible ? `Posiblemente ${posible}` : "Visitante")}
          </h2>
          <span className="text-muted-foreground">{datos.join(" · ")}</span>
          <span className="text-muted-foreground">
            {llego}
            {c.ruta && c.ruta !== "/" ? ` · empezó en ${c.ruta}` : ""}
            {c.valoracion === 1 && " · Valoró el chat: le sirvió"}
            {c.valoracion === -1 && " · Valoró el chat: no le sirvió"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.consulta_id && (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/web?estado=todas&consulta=${c.consulta_id}`} />}>
              <InboxIcon data-icon="inline-start" />
              Ver la consulta
            </Button>
          )}
          {c.estado !== "revisado" && <BotonEstado id={c.id} estado="revisado" label="Marcar revisado" principal />}
          {c.estado !== "archivado" && <BotonEstado id={c.id} estado="archivado" label="Archivar" />}
          {c.estado !== "nuevo" && <BotonEstado id={c.id} estado="nuevo" label="Volver a nuevo" />}
        </div>
      </div>

      {c.incidentes.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          {c.incidentes.map((i, n) => (
            <li key={n} className="flex gap-2">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                <strong>{INCIDENTES[i.tipo] ?? i.tipo}</strong> · {hora(i.en)}
                {i.mensaje ? <span className="text-muted-foreground"> · «{i.mensaje}»</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {c.mensajes.map((m, i) => {
          if (m.de === "consulta") {
            return (
              <li key={i} className="self-center rounded-full bg-lima px-3 text-xs leading-6 font-semibold text-carbon">
                {m.texto}
              </li>
            )
          }
          const info = m.turno !== undefined ? c.turnosInfo[m.turno] : undefined
          return (
            <li key={i} className={cn("flex max-w-[85%] flex-col gap-1", m.de === "persona" ? "items-end self-end" : "items-start self-start")}>
              <span
                className={cn(
                  "rounded-[14px] px-4 py-2.5 whitespace-pre-wrap",
                  m.de === "persona" ? "bg-foreground text-background" : "border bg-background"
                )}
              >
                {m.texto}
              </span>
              {info && (
                <span className="text-xs text-muted-foreground">
                  {[hora(info.en), info.rapida ? "respuesta rápida" : null, `respondió en ${formatearNumero(info.ms / 1000, 1)} s`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </li>
          )
        })}
      </ol>

      <div className="flex flex-col gap-3 border-t pt-4">
        <h3 className="m-0 text-sm font-semibold">Notas del equipo</h3>
        <GestionChat key={c.id} chatId={c.id} notas={c.notas} etiquetas={c.etiquetas} sugeridas={etiquetasUsadas} />
      </div>

      {c.hermanos.length > 0 && (
        <div className="flex flex-col gap-2 border-t pt-4">
          <h3 className="m-0 text-sm font-semibold">Otros chats del mismo visitante ese día</h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {c.hermanos.map((h) => (
              <li key={h.id}>
                <Link href={hrefChat(h.id)} scroll={false} className="text-foreground">
                  {hora(h.created_at)} · {h.consultas_web?.nombre ?? "Sin datos"} · {h.turnos} {h.turnos === 1 ? "mensaje" : "mensajes"}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.recorrido.length > 0 && (
        <details className="border-t pt-4">
          <summary className="cursor-pointer text-sm font-semibold">Qué hizo en la web ese día ({c.recorrido.length})</summary>
          <ol className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0 text-sm">
            {recorrido.map((e, n) => (
              <li key={n} className={cn("flex gap-3", e.chat && "font-semibold")}>
                <span className="w-12 shrink-0 text-muted-foreground tabular-nums">{hora(e.en)}</span>
                <span>{e.texto}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  )
}

function BotonEstado({ id, estado, label, principal }: { id: string; estado: EstadoChat; label: string; principal?: boolean }) {
  return (
    <form action={cambiarEstadoChat.bind(null, id, estado)}>
      <Button type="submit" variant={principal ? "outline" : "ghost"} size="sm">
        {label}
      </Button>
    </form>
  )
}

function describirEvento(e: EventoRecorrido): string {
  const p = e.props ?? {}
  switch (e.evento) {
    case "page_view": {
      const desde = e.utm_source ? `campaña ${e.utm_source}` : e.referente ? e.referente : "entrada directa"
      return `Entró a ${e.ruta ?? "/"} (${desde})`
    }
    case "section_view":
      return `Vio ${SECCIONES[String(p.section)] ?? p.section}`
    case "cta_click":
      return p.target === "chat" ? "" : `Tocó «${p.label || p.target}»`
    case "email_click":
      return "Tocó el mail"
    case "language_change":
      return `Cambió el idioma a ${p.language === "en" ? "inglés" : "español"}`
    case "generate_lead":
      return p.method === "chat" ? "Dejó sus datos en el chat" : "Mandó el formulario de contacto"
    case "form_error":
      return "Error en el formulario"
    default:
      return ""
  }
}

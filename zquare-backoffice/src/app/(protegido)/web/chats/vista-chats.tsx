import Link from "next/link"
import { ArrowLeftIcon, InboxIcon, MessagesSquareIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Encabezado } from "@/components/zq/encabezado"
import type { MensajeVisible } from "@/lib/chat-web"
import { fechaCorta, fechaRelativa, formatearNumero } from "@/lib/formato"
import { cn } from "@/lib/utils"

export type ChatLista = {
  id: string
  turnos: number
  idioma: "es" | "en" | null
  dispositivo: "movil" | "tablet" | "escritorio" | null
  created_at: string
  updated_at: string
  consulta_id: string | null
  primero: string | null
  consultas_web: { nombre: string } | null
}

type ChatElegido = ChatLista & {
  mensajes: MensajeVisible[]
  tokensEntrada: number
  tokensSalida: number
  ruta: string | null
}

const DISPOSITIVOS: Record<string, string> = { movil: "Celular", tablet: "Tablet", escritorio: "Computadora" }

// Precio de Claude Haiku 5.5 (USD por millón de tokens, prompts de hasta
// 100K): solo para tener una idea de cuánto cuesta cada conversación.
const USD_ENTRADA = 0.1
const USD_SALIDA = 0.5

// Web → Chats: lo que la gente le pregunta al chat de zquare.uy. Lista a la
// izquierda (la más reciente arriba) y la conversación elegida a la derecha.
// Si dejó sus datos, la consulta está en la bandeja (Web → Consultas).
export function VistaChats({
  chats,
  elegido,
  elegidoEnUrl,
  apagado,
  configurar,
}: {
  chats: ChatLista[]
  elegido: ChatElegido | null
  elegidoEnUrl: boolean
  // El chat está apagado en Web → Chats → Configurar.
  apagado: boolean
  // Botón y diálogo de configuración (cliente), armado en page.tsx.
  configurar: React.ReactNode
}) {
  return (
    <>
      <Encabezado titulo="Chats" rotulo="Web · zquare.uy" acciones={configurar} />

      {apagado && (
        <p className="m-0 rounded-xl border border-dashed border-input px-4 py-3 text-muted-foreground">
          El chat está <strong className="text-foreground">apagado</strong>: la web no lo muestra. Prendelo en Configurar.
        </p>
      )}

      {chats.length === 0 ? (
        <div className="rounded-xl border border-dashed border-input p-8 text-center text-muted-foreground">
          <p className="m-0 font-semibold text-foreground">Todavía no hay conversaciones</p>
          <p className="m-0 mt-1">Las que la gente tenga con el chat de zquare.uy aparecen en esta lista.</p>
        </div>
      ) : (
        <div className="flex min-h-[560px] flex-wrap items-stretch overflow-hidden rounded-xl border bg-card">
          <nav
            aria-label="Conversaciones"
            className={cn(
              "flex min-w-[260px] flex-[0_1_340px] flex-col gap-0.5 border-r p-3 max-escritorio:flex-auto max-escritorio:border-r-0",
              elegidoEnUrl && "max-escritorio:hidden"
            )}
          >
            {chats.map((c) => {
              const on = c.id === elegido?.id
              return (
                <Link
                  key={c.id}
                  href={`/web/chats?chat=${c.id}`}
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
                    <span className="truncate font-semibold">{c.consultas_web?.nombre ?? c.primero ?? "Conversación"}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {`${c.turnos} ${c.turnos === 1 ? "mensaje" : "mensajes"} · ${fechaRelativa(c.updated_at)}`}
                    </span>
                  </span>
                </Link>
              )
            })}
          </nav>

          {elegido ? <Conversacion chat={elegido} soloEnEscritorio={!elegidoEnUrl} /> : null}
        </div>
      )}
    </>
  )
}

function Conversacion({ chat: c, soloEnEscritorio }: { chat: ChatElegido; soloEnEscritorio: boolean }) {
  const costo = (c.tokensEntrada * USD_ENTRADA + c.tokensSalida * USD_SALIDA) / 1_000_000
  const datos = [
    `${fechaCorta(c.created_at)} · ${fechaRelativa(c.created_at).toLowerCase()}`,
    c.dispositivo ? DISPOSITIVOS[c.dispositivo] : null,
    c.idioma === "en" ? "En inglés" : null,
    `US$ ${formatearNumero(costo, 4)}`,
  ].filter(Boolean)

  return (
    <section
      aria-label="Conversación"
      className={cn("flex min-w-0 flex-[1_1_480px] flex-col gap-5 px-8 py-7 max-escritorio:px-4", soloEnEscritorio && "max-escritorio:hidden")}
    >
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/web/chats" />} className="-ml-2 self-start escritorio:hidden">
        <ArrowLeftIcon data-icon="inline-start" />
        Todas las conversaciones
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 font-display text-[30px] leading-9 font-normal">{c.consultas_web?.nombre ?? "Visitante"}</h2>
          <span className="text-muted-foreground">{datos.join(" · ")}</span>
        </div>
        {c.consulta_id && (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/web?estado=todas&consulta=${c.consulta_id}`} />}>
            <InboxIcon data-icon="inline-start" />
            Ver la consulta
          </Button>
        )}
      </div>

      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {c.mensajes.map((m, i) =>
          m.de === "consulta" ? (
            <li key={i} className="self-center rounded-full bg-lima px-3 text-xs leading-6 font-semibold text-carbon">
              {m.texto}
            </li>
          ) : (
            <li
              key={i}
              className={cn(
                "max-w-[85%] rounded-[14px] px-4 py-2.5 whitespace-pre-wrap",
                m.de === "persona" ? "self-end bg-foreground text-background" : "self-start border bg-background"
              )}
            >
              {m.texto}
            </li>
          )
        )}
      </ol>
    </section>
  )
}

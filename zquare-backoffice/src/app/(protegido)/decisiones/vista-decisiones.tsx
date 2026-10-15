"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { PinIcon, PlayIcon } from "lucide-react"

import { Popover, PopoverCancelar, PopoverTitulo } from "@/components/zq/popover"
import { type Cliente, type Decision, type Socio } from "@/lib/dominio"
import { fechaCorta, iniciales } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { type OpcionReunion } from "./campos-decision"
import { DecisionAcciones } from "./decision-acciones"
import { NuevaDecision } from "./nueva-decision"
import { esSocio, puntosDe, resumenDe } from "./puntos"

// La reunión de la que salió la decisión (`reunion_id`), con su
// transcripción si la hay. La arma el server.
export type OrigenDecision = { id: string; titulo: string; transcripcion: string | null }

export function VistaDecisiones({
  decisiones,
  socios,
  clientes,
  proyectos,
  origenes,
  reuniones,
  decisionAbierta,
}: {
  decisiones: Decision[]
  socios: Socio[]
  clientes: Pick<Cliente, "id" | "nombre">[]
  proyectos: { id: string; nombre: string; cliente_id: string | null }[]
  origenes: Record<string, OrigenDecision>
  reuniones: OpcionReunion[]
  decisionAbierta?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]))
  const proyecto = new Map(proyectos.map((p) => [p.id, p]))

  // Acuerdos de socios: las decisiones de la empresa (sin cliente ni
  // proyecto). Siempre arriba.
  const acuerdos = decisiones.filter((d) => !d.cliente_id && !d.proyecto_id)
  // Decisiones por cliente (el de la decisión, o el de su proyecto).
  const clienteDe = (d: Decision) => d.cliente_id ?? (d.proyecto_id ? proyecto.get(d.proyecto_id)?.cliente_id : null) ?? null
  const conCliente = decisiones.filter((d) => !acuerdos.includes(d))
  const tabs = Array.from(
    conCliente.reduce((m, d) => {
      const id = clienteDe(d) ?? "interno"
      return m.set(id, (m.get(id) ?? 0) + 1)
    }, new Map<string, number>())
  )
    .map(([id, n]) => ({ id, nombre: id === "interno" ? "Interno" : (nombreCliente.get(id) ?? "Cliente"), n }))
    .sort((a, b) => b.n - a.n)

  const [tab, setTab] = useState(tabs[0]?.id ?? null)
  const [abierta, setAbierta] = useState<string | null>(decisionAbierta ?? null)
  const delTab = conCliente.filter((d) => (clienteDe(d) ?? "interno") === tab)
  const decision = decisiones.find((d) => d.id === abierta) ?? null

  function cerrar() {
    setAbierta(null)
    if (searchParams.get("decision")) router.replace(pathname, { scroll: false })
  }

  return (
    <>
      <section aria-labelledby="acuerdos" className="flex flex-col gap-4 rounded-xl bg-carbon px-6 py-5 text-crema dark:border dark:bg-sidebar">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <PinIcon className="size-[18px] text-lima" aria-hidden="true" />
            <h2 id="acuerdos" className="m-0 text-base font-semibold">
              Acuerdos de socios
            </h2>
            <span className="text-xs text-sidebar-muted">Siempre fijados arriba</span>
          </div>
          <NuevaDecision socios={socios} clientes={clientes} reuniones={reuniones} acuerdo />
        </div>
        {acuerdos.length === 0 ? (
          <p className="m-0 text-sm text-sidebar-muted">Todavía no hay acuerdos de socios.</p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 p-0">
            {acuerdos.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 rounded-[10px] bg-white/6 px-4 py-3.5">
                <button
                  type="button"
                  onClick={() => setAbierta(a.id)}
                  className="text-left font-display text-lg leading-6 hover:underline"
                >
                  {a.titulo}
                </button>
                {a.detalle && <span className="line-clamp-2 text-[13px] text-crema/75">{resumenDe(a.detalle)}</span>}
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  <span className="flex pl-1.5">
                    {a.participantes.map((p) => (
                      <span
                        key={p}
                        title={p}
                        className="-ml-1.5 inline-flex size-6 items-center justify-center rounded-full bg-lima text-[9px] font-bold text-carbon ring-2 ring-carbon"
                      >
                        {iniciales(p)}
                      </span>
                    ))}
                  </span>
                  <span className="zq-num text-xs text-sidebar-muted">{fechaCorta(a.fecha)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="porcliente" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="porcliente" className="m-0 text-base font-semibold">
            Decisiones por cliente
          </h2>
          {tabs.length > 0 && (
            <div
              role="tablist"
              aria-label="Cliente"
              className="flex gap-1 rounded-full bg-muted p-[3px] max-escritorio:-mx-4 max-escritorio:w-[calc(100%+2rem)] max-escritorio:overflow-x-auto max-escritorio:rounded-none max-escritorio:bg-transparent max-escritorio:px-4"
            >
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={t.id === tab}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] whitespace-nowrap",
                    t.id === tab ? "bg-foreground font-semibold text-background" : "text-foreground hover:bg-foreground/5 max-escritorio:bg-muted"
                  )}
                >
                  {t.nombre} · {t.n}
                </button>
              ))}
            </div>
          )}
        </div>
        {delTab.length === 0 ? (
          <p className="m-0 rounded-xl border border-dashed border-input p-6 text-center text-muted-foreground">
            Todavía no hay decisiones con clientes.
          </p>
        ) : (
          <ol className="m-0 flex list-none flex-col rounded-xl border bg-card px-5 py-1 p-0">
            {delTab.map((d) => (
              <li key={d.id} className="flex flex-wrap items-start gap-x-5 gap-y-1 border-t py-3.5 first:border-t-0">
                <span className="zq-num w-16 shrink-0 pt-0.5 text-xs text-muted-foreground">{fechaCorta(d.fecha)}</span>
                <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5">
                  <button type="button" onClick={() => setAbierta(d.id)} className="text-left font-semibold hover:underline">
                    {d.titulo}
                  </button>
                  {d.detalle && <span className="line-clamp-2 text-[13px] text-muted-foreground">{resumenDe(d.detalle)}</span>}
                </div>
                {d.proyecto_id && proyecto.has(d.proyecto_id) && (
                  <span className="shrink-0 text-xs text-muted-foreground">{proyecto.get(d.proyecto_id)!.nombre}</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {decision && (
        <FichaDecision
          key={decision.id}
          decision={decision}
          socios={socios}
          clientes={clientes}
          reuniones={reuniones}
          cliente={clienteDe(decision) ? (nombreCliente.get(clienteDe(decision)!) ?? null) : null}
          clienteId={clienteDe(decision)}
          proyecto={decision.proyecto_id ? (proyecto.get(decision.proyecto_id) ?? null) : null}
          origen={origenes[decision.id] ?? null}
          onCerrar={cerrar}
        />
      )}
    </>
  )
}

// Ficha de decisión (Popover de una columna): fecha y destino, título,
// origen, los puntos numerados con el minuto de la reunión, quiénes
// estuvieron y la transcripción.
function FichaDecision({
  decision,
  socios,
  clientes,
  reuniones,
  cliente,
  clienteId,
  proyecto,
  origen,
  onCerrar,
}: {
  decision: Decision
  socios: Socio[]
  clientes: Pick<Cliente, "id" | "nombre">[]
  reuniones: OpcionReunion[]
  cliente: string | null
  clienteId: string | null
  proyecto: { id: string; nombre: string } | null
  origen: OrigenDecision | null
  onCerrar: () => void
}) {
  const puntos = puntosDe(decision.detalle)
  const presentes = decision.participantes.map((p) => ({ nombre: p, socio: esSocio(p, socios) }))
  const nSocios = presentes.filter((p) => p.socio).length
  const nOtros = presentes.length - nSocios
  const destino = proyecto
    ? { texto: `${cliente ? `${cliente} · ` : ""}${proyecto.nombre} →`, href: `/proyectos/${proyecto.id}` }
    : clienteId
      ? { texto: `${cliente ?? "Cliente"} →`, href: `/clientes/${clienteId}` }
      : { texto: "Acuerdo de socios", href: null }

  return (
    <Popover
      open
      onOpenChange={(v) => !v && onCerrar()}
      aria-label={decision.titulo}
      acciones={
        <>
          <DecisionAcciones decision={decision} socios={socios} clientes={clientes} reuniones={reuniones} />
          <PopoverCancelar>Cerrar</PopoverCancelar>
        </>
      }
    >
      <div className="flex flex-col gap-2 pr-8">
        <div className="flex flex-wrap gap-1.5">
          <span className="zq-chip min-h-7 text-xs font-semibold">{fechaCorta(decision.fecha)}</span>
          {destino.href ? (
            <Link href={destino.href} className="zq-chip min-h-7 text-xs no-underline hover:bg-accent">
              {destino.texto}
            </Link>
          ) : (
            <span className="zq-chip min-h-7 bg-carbon text-xs text-crema">{destino.texto}</span>
          )}
        </div>
        <PopoverTitulo>{decision.titulo}</PopoverTitulo>
        {origen && (
          <Link href={`/reuniones/${origen.id}`} className="self-start text-[13px] text-muted-foreground hover:underline">
            Reunión «{origen.titulo}»
          </Link>
        )}
      </div>

      {puntos.length > 0 && (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {puntos.map((p, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="zq-num inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <strong className="font-semibold">{p.titulo}</strong>
                {p.aclaracion && <span className="text-[13px] text-muted-foreground">{p.aclaracion}</span>}
              </span>
              {p.minuto &&
                (origen?.transcripcion ? (
                  <a
                    href={origen.transcripcion}
                    target="_blank"
                    rel="noreferrer"
                    title={`Abrir la transcripción (minuto ${p.minuto})`}
                    className="zq-num inline-flex shrink-0 items-center gap-1 rounded-full bg-lima px-2.5 text-xs leading-6 font-semibold text-carbon no-underline"
                  >
                    <PlayIcon className="size-3" aria-hidden="true" />
                    {p.minuto}
                  </a>
                ) : (
                  <span className="zq-num inline-flex shrink-0 items-center gap-1 rounded-full bg-lima px-2.5 text-xs leading-6 font-semibold text-carbon">
                    <PlayIcon className="size-3" aria-hidden="true" />
                    {p.minuto}
                  </span>
                ))}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex items-center gap-2.5">
          {presentes.length > 0 && (
            <span className="flex pl-1.5" aria-hidden="true">
              {presentes.map((p) => (
                <span
                  key={p.nombre}
                  title={p.nombre}
                  className={cn(
                    "-ml-1.5 inline-flex size-[30px] items-center justify-center rounded-full text-[10px] font-bold text-carbon ring-2 ring-card",
                    p.socio ? "bg-lima" : "bg-arena"
                  )}
                >
                  {iniciales(p.nombre)}
                </span>
              ))}
            </span>
          )}
          <span className="text-[13px] text-muted-foreground">
            {presentes.length === 0
              ? "Sin participantes cargados"
              : [
                  nSocios > 0 && `${nSocios} ${nSocios === 1 ? "socio" : "socios"}`,
                  nOtros > 0 && `${nOtros} ${cliente ? `de ${cliente}` : nOtros === 1 ? "invitado" : "invitados"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </span>
        </div>
        {origen?.transcripcion && (
          <a
            href={origen.transcripcion}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[13px] font-semibold"
          >
            <PlayIcon className="size-3.5" aria-hidden="true" />
            Transcripción completa
          </a>
        )}
      </div>
    </Popover>
  )
}

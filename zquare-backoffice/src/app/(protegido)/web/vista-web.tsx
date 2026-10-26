import Link from "next/link"
import { ArrowLeftIcon, MailIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Encabezado } from "@/components/zq/encabezado"
import { fechaCorta, fechaRelativa, iniciales } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { cambiarEstadoConsulta, promoverACliente, vincularACliente, type EstadoConsulta } from "./actions"

// Número para wa.me: solo dígitos; un número uruguayo escrito con el 0 adelante
// (099 123 456) pasa a llevar el código de país (59899123456).
function aWhatsApp(tel: string): string {
  const d = tel.replace(/[^0-9]/g, "")
  return d.startsWith("0") ? `598${d.slice(1)}` : d
}

export type Consulta = {
  id: string
  nombre: string
  email: string
  empresa: string | null
  telefono: string | null
  conocio: string | null
  intereses: string[]
  mensaje: string
  idioma: "es" | "en" | null
  estado: EstadoConsulta
  cliente_id: string | null
  created_at: string
  revisada_at: string | null
  clientes: { id: string; nombre: string } | null
  origen: "formulario" | "chat"
  // La conversación del chat de la web en la que la dejó, si vino por ahí.
  chats_web: { id: string }[]
}

export const FILTROS: { valor: EstadoConsulta | "todas"; label: string }[] = [
  { valor: "nueva", label: "Nuevas" },
  { valor: "atendida", label: "Atendidas" },
  { valor: "descartada", label: "Descartadas" },
  { valor: "todas", label: "Todas" },
]

// Cuántas consultas hay por «cómo nos conoció» (para las pastillas de origen),
// de más a menos; las que no lo dijeron no cuentan.
export function contarConocio(consultas: Consulta[]): { clave: string; n: number }[] {
  const n = new Map<string, number>()
  for (const c of consultas) if (c.conocio) n.set(c.conocio, (n.get(c.conocio) ?? 0) + 1)
  return [...n].map(([clave, n]) => ({ clave, n })).sort((a, b) => b.n - a.n || a.clave.localeCompare(b.clave))
}

const ETIQUETA_ESTADO: Record<EstadoConsulta, string> = {
  nueva: "Nueva",
  atendida: "Atendida",
  descartada: "Descartada",
}

const ESTILO_ESTADO: Record<EstadoConsulta, string> = {
  nueva: "bg-lima text-carbon",
  atendida: "bg-muted text-foreground",
  descartada: "bg-foreground text-background",
}

// Web: todo lo que llega desde zquare.uy. Por ahora, las consultas del
// formulario de contacto: lista a la izquierda (filtrada por estado) y la
// consulta elegida a la derecha (`?consulta=<id>`). Acá se analizan y, si
// corresponde, se promueven al resto del backoffice (cliente nuevo o
// existente). Los datos los trae page.tsx.
export function VistaWeb({
  consultas,
  filtro,
  redes,
  red,
  elegida,
  elegidaEnUrl,
  existente,
}: {
  consultas: Consulta[]
  filtro: EstadoConsulta | "todas"
  // Orígenes («cómo nos conoció») que hay en el estado elegido, y el filtrado.
  redes: { clave: string; n: number }[]
  red: string | null
  elegida: Consulta | null
  elegidaEnUrl: boolean
  // Cliente con el mismo email que la elegida, si todavía no está vinculada.
  existente: { id: string; nombre: string } | null
}) {
  // Las URL llevan solo lo que no es el valor por defecto (estado nueva, sin red).
  const href = (p: { estado?: string; red?: string | null; consulta?: string }) => {
    const q = new URLSearchParams()
    const estado = p.estado ?? filtro
    if (estado !== "nueva") q.set("estado", estado)
    const r = p.red === undefined ? red : p.red
    if (r) q.set("red", r)
    if (p.consulta) q.set("consulta", p.consulta)
    const s = q.toString()
    return s ? `/web?${s}` : "/web"
  }
  const hrefFiltro = (valor: string) => href({ estado: valor })
  const hrefConsulta = (id: string) => href({ consulta: id })

  return (
    <>
      <Encabezado titulo="Consultas" rotulo="Web · zquare.uy" />

      <nav className="zq-pildoras self-start" aria-label="Estado de las consultas">
        {FILTROS.map((f) => (
          <Link key={f.valor} href={hrefFiltro(f.valor)} scroll={false} aria-current={f.valor === filtro ? "page" : undefined}>
            {f.label}
          </Link>
        ))}
      </nav>

      {redes.length > 0 && (
        <nav className="zq-pildoras -mt-3 self-start" aria-label="Cómo nos conocieron">
          <Link href={href({ red: null })} scroll={false} aria-current={red ? undefined : "page"}>
            Todos los orígenes
          </Link>
          {redes.map((r) => (
            <Link key={r.clave} href={href({ red: r.clave })} scroll={false} aria-current={r.clave === red ? "page" : undefined}>
              {r.clave} · {r.n}
            </Link>
          ))}
        </nav>
      )}

      {consultas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-input p-8 text-center text-muted-foreground">
          <p className="m-0 font-semibold text-foreground">
            {filtro === "nueva" ? "No hay consultas nuevas" : "No hay consultas acá"}
          </p>
          <p className="m-0 mt-1">Las que lleguen por el formulario de contacto o el chat de zquare.uy aparecen en esta lista.</p>
        </div>
      ) : (
        <div className="flex min-h-[560px] flex-wrap items-stretch overflow-hidden rounded-xl border bg-card">
          <nav
            aria-label="Consultas"
            className={cn(
              "flex min-w-[260px] flex-[0_1_340px] flex-col gap-0.5 border-r p-3 max-escritorio:flex-auto max-escritorio:border-r-0",
              elegidaEnUrl && "max-escritorio:hidden"
            )}
          >
            {consultas.map((c) => {
              const on = c.id === elegida?.id
              return (
                <Link
                  key={c.id}
                  href={hrefConsulta(c.id)}
                  scroll={false}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex min-h-[56px] items-center gap-3 rounded-lg px-2.5 py-2 text-foreground no-underline hover:bg-muted",
                    on && "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold",
                      c.estado === "nueva" ? "bg-lima text-carbon" : "bg-muted text-foreground"
                    )}
                  >
                    {iniciales(c.nombre)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">{c.nombre}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[c.empresa, c.conocio, c.origen === "chat" ? "Por el chat" : null, fechaRelativa(c.created_at)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </Link>
              )
            })}
          </nav>

          {elegida ? (
            <FichaConsulta
              consulta={elegida}
              existente={existente}
              volverA={href({})}
              soloEnEscritorio={!elegidaEnUrl}
            />
          ) : null}
        </div>
      )}
    </>
  )
}


function FichaConsulta({
  consulta: c,
  existente,
  volverA,
  soloEnEscritorio,
}: {
  consulta: Consulta
  existente: { id: string; nombre: string } | null
  volverA: string
  // En celular, sin una consulta elegida en la URL se ve solo la lista.
  soloEnEscritorio: boolean
}) {
  const asunto = c.idioma === "en" ? "Your message to Zquare" : "Tu consulta a Zquare"

  return (
    <section
      aria-label={`Consulta de ${c.nombre}`}
      className={cn("flex min-w-0 flex-[1_1_480px] flex-col gap-6 px-8 py-7 max-escritorio:px-4", soloEnEscritorio && "max-escritorio:hidden")}
    >
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        render={<Link href={volverA} />}
        className="-ml-2 self-start escritorio:hidden"
      >
        <ArrowLeftIcon data-icon="inline-start" />
        Todas las consultas
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="m-0 font-display text-[30px] leading-9 font-normal">{c.nombre}</h2>
            <span className={cn("rounded-full px-2.5 text-xs leading-[22px] font-semibold", ESTILO_ESTADO[c.estado])}>
              {ETIQUETA_ESTADO[c.estado]}
            </span>
          </div>
          <span className="text-muted-foreground">
            {[c.empresa, c.email, `${fechaCorta(c.created_at)} · ${fechaRelativa(c.created_at).toLowerCase()}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<a href={`mailto:${c.email}?subject=${encodeURIComponent(asunto)}`} />}
        >
          <MailIcon data-icon="inline-start" />
          Responder por mail
        </Button>
      </div>

      {(c.telefono || c.conocio) && (
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          {c.telefono && (
            <div className="flex flex-col gap-1">
              <h3 className="zq-rotulo text-[13px]">Teléfono / WhatsApp</h3>
              <a className="underline underline-offset-4" href={`https://wa.me/${aWhatsApp(c.telefono)}`} target="_blank" rel="noreferrer">
                {c.telefono}
              </a>
            </div>
          )}
          {c.conocio && (
            <div className="flex flex-col gap-1">
              <h3 className="zq-rotulo text-[13px]">Nos conoció por</h3>
              <span>{c.conocio}</span>
            </div>
          )}
        </div>
      )}

      {c.intereses.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="zq-rotulo text-[13px]">Le interesa</h3>
          <div className="flex flex-wrap gap-1.5">
            {c.intereses.map((i) => (
              <span key={i} className="rounded-full bg-muted px-2.5 text-sm leading-7">
                {i}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="zq-rotulo text-[13px]">
          {c.origen === "chat" ? "Resumen del chat" : "Mensaje"}
          {c.idioma === "en" ? " (en inglés)" : ""}
        </h3>
        <p className="m-0 rounded-[10px] border px-4 py-3.5 whitespace-pre-wrap">{c.mensaje}</p>
        {c.chats_web[0] && (
          <Link href={`/web/chats?chat=${c.chats_web[0].id}`} className="self-start text-sm font-semibold text-foreground">
            Ver la conversación completa
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="zq-rotulo text-[13px]">Llevar al backoffice</h3>
        {c.clientes ? (
          <p className="m-0">
            Está en Clientes como{" "}
            <Link href={`/clientes?cliente=${c.clientes.id}`} className="font-semibold text-foreground">
              {c.clientes.nombre}
            </Link>
            .
          </p>
        ) : existente ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="m-0">
              Ya existe un cliente con este email:{" "}
              <Link href={`/clientes?cliente=${existente.id}`} className="font-semibold text-foreground">
                {existente.nombre}
              </Link>
              .
            </p>
            <form action={vincularACliente.bind(null, c.id, existente.id)}>
              <Button type="submit" size="sm">
                Vincular a {existente.nombre}
              </Button>
            </form>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="m-0 text-muted-foreground">Todavía no es cliente.</p>
            <form action={promoverACliente.bind(null, c.id)}>
              <Button type="submit" size="sm">
                Crear cliente potencial
              </Button>
            </form>
          </div>
        )}
      </div>

      <div className="mt-auto flex flex-wrap gap-2 border-t pt-4">
        {c.estado !== "atendida" && (
          <form action={cambiarEstadoConsulta.bind(null, c.id, "atendida")}>
            <Button type="submit" variant="outline" size="sm">
              Marcar atendida
            </Button>
          </form>
        )}
        {c.estado !== "descartada" && (
          <form action={cambiarEstadoConsulta.bind(null, c.id, "descartada")}>
            <Button type="submit" variant="ghost" size="sm">
              Descartar
            </Button>
          </form>
        )}
        {c.estado !== "nueva" && (
          <form action={cambiarEstadoConsulta.bind(null, c.id, "nueva")}>
            <Button type="submit" variant="ghost" size="sm">
              Volver a nueva
            </Button>
          </form>
        )}
      </div>
    </section>
  )
}

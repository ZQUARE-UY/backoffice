"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowUpRightIcon } from "lucide-react"
import { toast } from "sonner"

import { Popover, PopoverTitulo } from "@/components/zq/popover"
import {
  codigoIdea,
  ESTADOS_IDEA,
  type ComentarioIdea,
  type Idea,
  type Socio,
  type VotoIdea,
} from "@/lib/dominio"
import { iniciales } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { comentarIdea } from "./actions"
import { urlIterarIdea } from "./chat-claude"
import { GraduarIdea } from "./[id]/graduar-idea"
import { Votacion } from "./votacion"

// Giro de cada nota (±1°), fijo por posición para que no salte al recargar.
const GIROS = [-1.2, 0.9, -0.6, 1.1, -0.9, 0.7]

// Markdown → texto corrido, para las líneas cortas de la nota.
function plano(texto: string | null): string {
  if (!texto) return ""
  return texto
    .replace(/[*_`#>]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
}

type Datos = {
  ideas: Idea[]
  votos: VotoIdea[]
  comentarios: ComentarioIdea[]
  socios: Socio[]
  miSocioId: string | null
  proyectos: { id: string; nombre: string }[]
  ideaAbierta?: number
  // La nota "Anotá una semilla", al final de la grilla.
  children?: React.ReactNode
}

// Muro de post-its: aprobadas en lima, el resto en card con borde. Clic en
// el título abre la ficha (la misma nota agrandada).
export function Muro({ ideas, votos, comentarios, socios, miSocioId, proyectos, ideaAbierta, children }: Datos) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [abierta, setAbierta] = useState<string | null>(
    () => ideas.find((i) => i.numero === ideaAbierta)?.id ?? null
  )
  const nombreSocio = new Map(socios.map((s) => [s.id, s.nombre.split(" ")[0]]))
  const nombreProyecto = new Map(proyectos.map((p) => [p.id, p.nombre]))

  function cerrar() {
    setAbierta(null)
    // Al cerrar se limpia el deep link, para que un refresh no reabra.
    if (searchParams.get("idea")) router.replace(pathname, { scroll: false })
  }

  const idea = ideas.find((i) => i.id === abierta) ?? null

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] items-start gap-x-7 gap-y-8 px-1 py-2">
        {ideas.map((i, n) => {
          const aprobada = i.estado === "aprobada"
          const deLaIdea = votos.filter((v) => v.idea_id === i.id)
          const si = deLaIdea.filter((v) => v.valor === "si").length
          const dudas = deLaIdea.filter((v) => v.valor === "dudas").length
          const no = deLaIdea.filter((v) => v.valor === "no").length
          return (
            <article
              key={i.id}
              style={{ transform: `rotate(${GIROS[n % GIROS.length]}deg)` }}
              className={cn(
                "flex min-h-[340px] flex-col gap-3.5 rounded-md p-6 shadow-[0_10px_24px_rgba(30,39,44,0.12)]",
                aprobada ? "bg-lima text-carbon" : "border bg-card text-card-foreground",
                i.estado === "descartada" && "opacity-60"
              )}
            >
              <div className="flex items-center justify-between gap-2 text-xs leading-4 opacity-80">
                <span className="font-bold tracking-[0.04em] uppercase">
                  {codigoIdea(i.numero)} · {ESTADOS_IDEA[i.estado].label}
                </span>
                <span>{i.created_by ? nombreSocio.get(i.created_by) : null}</span>
              </div>
              <h2 className="m-0 font-display text-[26px] leading-[30px] font-normal">
                <button type="button" onClick={() => setAbierta(i.id)} className="text-left hover:underline">
                  {i.titulo}
                </button>
              </h2>
              <p className="m-0 line-clamp-4 opacity-85">{plano(i.problema ?? i.descripcion)}</p>
              {i.etiquetas.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {i.etiquetas.map((t) => (
                    <span
                      key={t}
                      className={cn("rounded-full px-2 text-xs leading-5", aprobada ? "bg-carbon/10" : "bg-muted")}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-current/15 pt-3">
                <button
                  type="button"
                  onClick={() => setAbierta(i.id)}
                  className="zq-num min-h-9 rounded-full border border-current px-3 text-[13px] font-bold"
                  aria-label={`Votos de ${codigoIdea(i.numero)}: ${si} sí, ${dudas} con dudas, ${no} no. Votar`}
                >
                  {si + dudas + no === 0 ? "Votar" : `Sí ${si}${dudas ? ` · Dudas ${dudas}` : ""}${no ? ` · No ${no}` : ""}`}
                </button>
                {i.proyecto_id && nombreProyecto.has(i.proyecto_id) ? (
                  <Link href={`/proyectos/${i.proyecto_id}`} className="inline-flex min-h-9 items-center font-semibold text-inherit">
                    Ver proyecto →
                  </Link>
                ) : i.estado !== "descartada" ? (
                  <a
                    href={urlIterarIdea(i)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-9 items-center font-semibold text-inherit"
                  >
                    Bajar a tierra con Claude →
                  </a>
                ) : null}
              </div>
            </article>
          )
        })}
        {children}
      </div>

      {idea && (
        <FichaIdea
          key={idea.id}
          idea={idea}
          votos={votos.filter((v) => v.idea_id === idea.id)}
          comentarios={comentarios.filter((c) => c.idea_id === idea.id)}
          socios={socios}
          miSocioId={miSocioId}
          autor={idea.created_by ? (nombreSocio.get(idea.created_by) ?? null) : null}
          proyecto={idea.proyecto_id ? { id: idea.proyecto_id, nombre: nombreProyecto.get(idea.proyecto_id) ?? "Proyecto" } : null}
          onCerrar={cerrar}
        />
      )}
    </>
  )
}

function Linea({ rotulo, texto }: { rotulo: string; texto: string | null }) {
  if (!texto) return null
  return (
    <div>
      <span className="zq-postit-rotulo">{rotulo}</span>
      <span className="line-clamp-2">{plano(texto)}</span>
    </div>
  )
}

// Ficha de idea: la nota agrandada, centrada sobre el fondo borroso.
function FichaIdea({
  idea,
  votos,
  comentarios,
  socios,
  miSocioId,
  autor,
  proyecto,
  onCerrar,
}: {
  idea: Idea
  votos: VotoIdea[]
  comentarios: ComentarioIdea[]
  socios: Socio[]
  miSocioId: string | null
  autor: string | null
  proyecto: { id: string; nombre: string } | null
  onCerrar: () => void
}) {
  const [mas, setMas] = useState(false)
  const [texto, setTexto] = useState("")
  const [enviando, iniciarEnvio] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const aprobada = idea.estado === "aprobada"
  const conOnePager = Boolean(idea.problema || idea.solucion || idea.impacto)
  const conDetalle = Boolean(idea.competencia || idea.esfuerzo || idea.proximos_pasos)

  function comentar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const cuerpo = texto.trim()
    if (!cuerpo) return
    const datos = new FormData()
    datos.set("cuerpo", cuerpo)
    iniciarEnvio(async () => {
      try {
        await comentarIdea(idea.id, datos)
        setTexto("")
        inputRef.current?.focus()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo comentar")
      }
    })
  }

  return (
    <Popover
      open
      onOpenChange={(v) => !v && onCerrar()}
      aria-label={`${codigoIdea(idea.numero)} · ${idea.titulo}`}
      className={cn("zq-postit", aprobada && "zq-postit-lima")}
    >
      <span className="pr-8 text-xs leading-4 font-bold tracking-[0.04em] uppercase opacity-75">
        {codigoIdea(idea.numero)} · {ESTADOS_IDEA[idea.estado].label}
        {autor && ` · ${autor}`}
      </span>
      <PopoverTitulo className="-mt-2 text-[32px] leading-9">{idea.titulo}</PopoverTitulo>

      {conOnePager ? (
        <div className="flex flex-col gap-2.5 text-[15px] leading-[21px]">
          <Linea rotulo="Problema" texto={idea.problema} />
          <Linea rotulo="Solución" texto={idea.solucion} />
          <Linea rotulo="Deja" texto={idea.impacto} />
        </div>
      ) : (
        <p className="m-0 text-[15px] leading-[21px]">{plano(idea.descripcion) || "Sin contexto todavía."}</p>
      )}
      {mas && conDetalle && (
        <div className="flex flex-col gap-2.5 border-t border-current/15 pt-2.5">
          {[
            ["Competencia", idea.competencia],
            ["Esfuerzo", idea.esfuerzo],
            ["Próximo paso", idea.proximos_pasos],
          ].map(([rotulo, valor]) =>
            valor ? (
              <div key={rotulo}>
                <span className="zq-postit-rotulo">{rotulo}</span>
                <span className="whitespace-pre-line">{plano(valor)}</span>
              </div>
            ) : null
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {conDetalle && (
          <button
            type="button"
            aria-expanded={mas}
            onClick={() => setMas((v) => !v)}
            className="text-[13px] font-semibold underline underline-offset-[3px]"
          >
            {mas ? "Ver menos" : "Leer más →"}
          </button>
        )}
        <Link href={`/ideas/${idea.id}`} className="text-[13px] font-semibold text-inherit underline underline-offset-[3px]">
          Ficha completa
        </Link>
      </div>

      <Votacion ideaId={idea.id} votos={votos} socios={socios} miSocioId={miSocioId} />

      {comentarios.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {comentarios.slice(-3).map((c) => (
            <li key={c.id} className="flex gap-2 text-[13px]">
              <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-carbon text-[9px] font-bold text-lima">
                {iniciales(c.autor)}
              </span>
              <span>
                <strong>{c.autor.split(" ")[0]}</strong> {c.cuerpo}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={comentar}
          className="flex min-w-[200px] flex-1 items-center gap-2 rounded-[10px] bg-carbon/8 py-1 pr-1 pl-3 dark:bg-white/10"
        >
          <input
            ref={inputRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="¿Qué opinás?"
            aria-label="Comentario"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:opacity-60"
          />
          <button
            type="submit"
            aria-label="Enviar comentario"
            disabled={enviando || !texto.trim()}
            className="flex size-[30px] items-center justify-center rounded-lg bg-carbon text-lima disabled:opacity-45"
          >
            <ArrowUpRightIcon className="size-4" aria-hidden="true" />
          </button>
        </form>
        {proyecto ? (
          <Link
            href={`/proyectos/${proyecto.id}`}
            className="inline-flex items-center gap-1 rounded-[10px] bg-carbon px-3 py-2.5 text-[13px] whitespace-nowrap text-crema no-underline"
          >
            Ya es proyecto: <strong className="font-semibold">{proyecto.nombre}</strong> →
          </Link>
        ) : idea.estado === "lista" ? (
          <GraduarIdea idea={idea} etiqueta="Pasar a proyecto" className="h-10 bg-carbon text-crema hover:bg-carbon/90" />
        ) : null}
      </div>
    </Popover>
  )
}

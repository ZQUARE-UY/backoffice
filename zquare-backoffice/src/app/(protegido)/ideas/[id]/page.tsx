import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, HistoryIcon, MessageCircleIcon, SparklesIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  codigoIdea,
  ESTADOS_IDEA,
  ONE_PAGER_IDEA,
  type CampoOnePager,
  type ComentarioIdea,
  type Idea,
  type Socio,
  type VersionIdea,
  type VotoIdea,
} from "@/lib/dominio"
import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"

import { urlIterarIdea, urlIterarSeccion } from "../chat-claude"
import { MarkdownIdea } from "../markdown-idea"
import { ComentariosIdea } from "./comentarios-idea"
import { IdeaAcciones, VotarIdea } from "./idea-acciones"

export const metadata = { title: "Idea" }

export default async function IdeaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: ideaData } = await supabase
    .from("ideas")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle()

  if (!ideaData) notFound()
  const idea = ideaData as Idea

  const [
    { data: comentariosData },
    { data: versionesData },
    { data: votosData },
    { data: sociosData },
    socioActual,
  ] = await Promise.all([
    supabase
      .from("ideas_comentarios")
      .select("id, idea_id, cuerpo, autor, autor_socio_id, created_at")
      .eq("idea_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("ideas_versiones")
      .select("id, idea_id, snapshot, autor, autor_socio_id, created_at")
      .eq("idea_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("ideas_votos").select("idea_id, socio_id").eq("idea_id", id),
    supabase.from("socios").select("id, nombre, email").is("deleted_at", null),
    idSocioActual(),
  ])

  const comentarios = (comentariosData ?? []) as ComentarioIdea[]
  const versiones = (versionesData ?? []) as VersionIdea[]
  const votos = (votosData ?? []) as VotoIdea[]
  const socios = (sociosData ?? []) as Socio[]
  const nombreSocio = new Map(socios.map((s) => [s.id, s.nombre]))
  const camposOnePager = Object.keys(ONE_PAGER_IDEA) as CampoOnePager[]
  const onePagerVacio = camposOnePager.every((c) => !idea[c])

  return (
    <>
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          render={<Link href="/ideas" />}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Banco de ideas
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-muted-foreground">
                {codigoIdea(idea.numero)}
              </span>
              <Badge variant={ESTADOS_IDEA[idea.estado].variant}>
                {ESTADOS_IDEA[idea.estado].label}
              </Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {idea.titulo}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {idea.created_by && (
                <span>de {nombreSocio.get(idea.created_by)}</span>
              )}
              <span>· {idea.created_at.slice(0, 10)}</span>
              {idea.etiquetas.map((e) => (
                <Badge key={e} variant="secondary">
                  {e}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={
                  <a
                    href={urlIterarIdea(idea)}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                <SparklesIcon data-icon="inline-start" />
                Iterar con Claude
              </Button>
              <VotarIdea
                ideaId={idea.id}
                votos={votos.length}
                yaVote={votos.some((v) => v.socio_id === socioActual)}
              />
              <IdeaAcciones idea={idea} />
            </div>
            {votos.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Votada por{" "}
                {votos
                  .map((v) => nombreSocio.get(v.socio_id) ?? "?")
                  .join(", ")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* El one-pager se lee como documento, no como dashboard: una sola
          columna con ancho de lectura y secciones sin cajas. La descripción
          es la SEMILLA original (la nota cruda de la que arrancó el análisis):
          mientras el one-pager está vacío es lo único que hay y abre la
          página; una vez madurada la idea, baja al final como nota de origen
          para no leerse como resumen de la idea actual. */}
      <div className="flex max-w-3xl flex-col gap-8">
        {onePagerVacio ? (
          <>
            {idea.descripcion && (
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {idea.descripcion}
              </p>
            )}
            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <p>
                El one-pager está vacío: la idea todavía es una semilla.
                Madurala iterando con Claude (usa el conector del backoffice)
                o editala a mano.
              </p>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={
                  <a
                    href={urlIterarIdea(idea)}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                <SparklesIcon data-icon="inline-start" />
                Bajarla a tierra con Claude
              </Button>
            </div>
          </>
        ) : (
          <>
            {camposOnePager.map((campo) =>
              idea[campo] ? (
                <section key={campo} className="flex flex-col gap-3">
                  {/* Título de sección con regla: el ojo encuentra dónde
                      empieza cada parte sin encajonar el texto. */}
                  <div className="flex items-center gap-3">
                    <h2 className="shrink-0 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                      {ONE_PAGER_IDEA[campo].label}
                    </h2>
                    <span className="h-px flex-1 bg-border" />
                    <a
                      href={urlIterarSeccion(idea, campo)}
                      target="_blank"
                      rel="noreferrer"
                      title={`Trabajar "${ONE_PAGER_IDEA[campo].label}" con Claude`}
                      className="shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground"
                    >
                      <MessageCircleIcon className="size-3.5" />
                    </a>
                  </div>
                  {/* El problema es la tesis de la idea: abre como lead. */}
                  <MarkdownIdea lead={campo === "problema"}>
                    {idea[campo]}
                  </MarkdownIdea>
                </section>
              ) : null
            )}
            {idea.descripcion && (
              <section className="flex flex-col gap-3 pt-2">
                <div className="flex items-center gap-3">
                  <h2 className="shrink-0 text-xs font-semibold tracking-widest text-muted-foreground/70 uppercase">
                    Semilla original
                  </h2>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                  {idea.descripcion}
                </p>
              </section>
            )}
          </>
        )}
      </div>

      <Separator />

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <ComentariosIdea ideaId={idea.id} comentarios={comentarios} />

        <div className="flex flex-col gap-3">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <HistoryIcon className="size-4" />
            Historial
          </span>
          {versiones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin ediciones.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {versiones.map((v, i) => (
                <div
                  key={v.id}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <span className="font-mono text-xs">
                    v{versiones.length - i}
                  </span>
                  <span className="text-foreground">{v.autor}</span>
                  <span className="ml-auto text-xs">
                    {v.created_at.slice(0, 10)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

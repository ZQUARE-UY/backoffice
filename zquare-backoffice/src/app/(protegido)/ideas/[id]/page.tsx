import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, HistoryIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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

      {idea.descripcion && (
        <p className="text-sm whitespace-pre-wrap text-muted-foreground">
          {idea.descripcion}
        </p>
      )}

      {onePagerVacio ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            El one-pager está vacío. Pedile a Claude &quot;bajá a tierra{" "}
            {codigoIdea(idea.numero)}&quot; desde claude.ai (con el conector
            del backoffice) para completarlo iterando, o editalo a mano.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {camposOnePager.map((campo) =>
            idea[campo] ? (
              <Card
                key={campo}
                className={campo === "proximos_pasos" ? "lg:col-span-2" : ""}
              >
                <CardContent className="flex flex-col gap-2">
                  <h2 className="text-sm font-medium text-muted-foreground">
                    {ONE_PAGER_IDEA[campo].label}
                  </h2>
                  <p className="text-sm whitespace-pre-wrap">{idea[campo]}</p>
                </CardContent>
              </Card>
            ) : null
          )}
        </div>
      )}

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

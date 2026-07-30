import Link from "next/link"
import { LightbulbIcon, MessageSquareIcon, ThumbsUpIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  codigoIdea,
  ESTADOS_IDEA,
  ESTADOS_IDEA_ORDEN,
  type Idea,
  type Socio,
  type VotoIdea,
} from "@/lib/dominio"
import { createClient } from "@/lib/supabase/server"

import { textoPlano } from "./markdown-idea"
import { NuevaIdea } from "./nueva-idea"

export const metadata = { title: "Ideas" }

export default async function IdeasPage() {
  const supabase = await createClient()

  const [{ data: ideasData }, { data: votosData }, { data: comentariosData }, { data: sociosData }] =
    await Promise.all([
      supabase
        .from("ideas")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase.from("ideas_votos").select("idea_id, socio_id"),
      supabase
        .from("ideas_comentarios")
        .select("idea_id")
        .is("deleted_at", null),
      supabase.from("socios").select("id, nombre, email").is("deleted_at", null),
    ])

  const ideas = (ideasData ?? []) as Idea[]
  const votos = (votosData ?? []) as VotoIdea[]
  const socios = (sociosData ?? []) as Socio[]
  const nombreSocio = new Map(socios.map((s) => [s.id, s.nombre]))

  const votosPorIdea = new Map<string, number>()
  for (const v of votos) {
    votosPorIdea.set(v.idea_id, (votosPorIdea.get(v.idea_id) ?? 0) + 1)
  }
  const comentariosPorIdea = new Map<string, number>()
  for (const c of (comentariosData ?? []) as { idea_id: string }[]) {
    comentariosPorIdea.set(c.idea_id, (comentariosPorIdea.get(c.idea_id) ?? 0) + 1)
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Banco de ideas
          </h1>
          <p className="text-muted-foreground">
            Anotá la semilla acá y madurala conversando con Claude (pedile
            &quot;bajar idea a tierra&quot; con el conector del backoffice).
          </p>
        </div>
        <NuevaIdea />
      </div>

      {ideas.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LightbulbIcon />
            </EmptyMedia>
            <EmptyTitle>Sin ideas todavía</EmptyTitle>
            <EmptyDescription>
              Capturá la primera con &quot;Nueva idea&quot; o contásela a
              Claude desde claude.ai — la guarda por MCP.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        ESTADOS_IDEA_ORDEN.map((estado) => {
          const delEstado = ideas.filter((i) => i.estado === estado)
          if (delEstado.length === 0) return null
          return (
            <section key={estado} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">
                  {ESTADOS_IDEA[estado].label}
                </h2>
                <span className="text-sm text-muted-foreground">
                  {delEstado.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {delEstado.map((idea) => (
                  <Link key={idea.id} href={`/ideas/${idea.id}`}>
                    <Card className="h-full transition-colors hover:bg-muted/50">
                      <CardContent className="flex h-full flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {codigoIdea(idea.numero)}
                          </span>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {(comentariosPorIdea.get(idea.id) ?? 0) > 0 && (
                              <span className="flex items-center gap-1">
                                <MessageSquareIcon className="size-3.5" />
                                {comentariosPorIdea.get(idea.id)}
                              </span>
                            )}
                            {(votosPorIdea.get(idea.id) ?? 0) > 0 && (
                              <span className="flex items-center gap-1">
                                <ThumbsUpIcon className="size-3.5" />
                                {votosPorIdea.get(idea.id)}
                              </span>
                            )}
                          </div>
                        </div>
                        <h3 className="font-medium leading-snug">
                          {idea.titulo}
                        </h3>
                        {(idea.problema ?? idea.descripcion) && (
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {textoPlano(idea.problema ?? idea.descripcion ?? "")}
                          </p>
                        )}
                        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                          {idea.etiquetas.map((e) => (
                            <Badge key={e} variant="secondary">
                              {e}
                            </Badge>
                          ))}
                          <span className="ml-auto text-xs text-muted-foreground">
                            {idea.created_by
                              ? nombreSocio.get(idea.created_by)
                              : null}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )
        })
      )}
    </>
  )
}

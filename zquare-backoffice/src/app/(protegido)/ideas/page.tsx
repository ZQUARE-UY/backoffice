import { Encabezado } from "@/components/zq/encabezado"
import {
  type ComentarioIdea,
  type EstadoIdea,
  type Idea,
  type Socio,
  type VotoIdea,
} from "@/lib/dominio"
import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"

import { Muro } from "./muro"
import { NuevaIdea } from "./nueva-idea"

export const metadata = { title: "Ideas" }

// Orden del muro: lo que pide una decisión primero, lo cerrado al final.
const PESO: Record<EstadoIdea, number> = {
  lista: 0,
  en_exploracion: 1,
  semilla: 2,
  aprobada: 3,
  descartada: 4,
}

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ idea?: string }>
}) {
  const { idea: ideaParam } = await searchParams
  const supabase = await createClient()

  const [
    { data: ideasData },
    { data: votosData },
    { data: comentariosData },
    { data: sociosData },
    { data: proyectosData },
    miSocioId,
  ] = await Promise.all([
    supabase.from("ideas").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("ideas_votos").select("idea_id, socio_id, valor"),
    supabase
      .from("ideas_comentarios")
      .select("id, idea_id, cuerpo, autor, autor_socio_id, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase.from("socios").select("id, nombre, email").is("deleted_at", null).order("nombre"),
    supabase.from("proyectos").select("id, nombre").is("deleted_at", null),
    idSocioActual(),
  ])

  const ideas = ((ideasData ?? []) as Idea[]).sort((a, b) => PESO[a.estado] - PESO[b.estado])
  // Deep link `?idea=7` (o IDEA-7): abre la ficha.
  const ideaAbierta = ideaParam ? Number(ideaParam.replace(/^idea-?/i, "")) || undefined : undefined

  return (
    <>
      <Encabezado
        titulo="Banco de ideas"
        acciones={
          <>
            <span className="flex items-center gap-3.5 text-[13px] text-muted-foreground max-escritorio:hidden">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-[2px] bg-lima" />
                Aprobada
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-[2px] border border-input bg-card" />
                Semilla
              </span>
            </span>
            <NuevaIdea escucharCrear />
          </>
        }
      />

      {ideas.length === 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-7">
          <NuevaIdea variante="nota" />
        </div>
      ) : (
        <Muro
          ideas={ideas}
          votos={(votosData ?? []) as VotoIdea[]}
          comentarios={(comentariosData ?? []) as ComentarioIdea[]}
          socios={(sociosData ?? []) as Socio[]}
          miSocioId={miSocioId}
          proyectos={(proyectosData ?? []) as { id: string; nombre: string }[]}
          ideaAbierta={ideaAbierta}
        >
          <NuevaIdea variante="nota" />
        </Muro>
      )}
    </>
  )
}

"use server"

import { revalidatePath } from "next/cache"

import { codigoIdea, type Idea } from "@/lib/dominio"
import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"

function textoOpcional(valor: FormDataEntryValue | null): string | null {
  const t = (valor as string | null)?.trim()
  return t ? t : null
}

function datosDesde(formData: FormData) {
  const titulo = (formData.get("titulo") as string | null)?.trim()
  if (!titulo) throw new Error("El título es obligatorio")
  const etiquetas = textoOpcional(formData.get("etiquetas"))
  return {
    titulo,
    descripcion: textoOpcional(formData.get("descripcion")),
    problema: textoOpcional(formData.get("problema")),
    competencia: textoOpcional(formData.get("competencia")),
    solucion: textoOpcional(formData.get("solucion")),
    esfuerzo: textoOpcional(formData.get("esfuerzo")),
    impacto: textoOpcional(formData.get("impacto")),
    proximos_pasos: textoOpcional(formData.get("proximos_pasos")),
    estado: (formData.get("estado") as string | null) ?? "semilla",
    etiquetas: etiquetas
      ? etiquetas
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean)
      : [],
  }
}

// Historial de co-edición: cada creación/edición deja un snapshot del
// one-pager con su autor. Explícito (no trigger) para poder atribuirlo.
async function guardarVersion(
  ideaId: string,
  snapshot: Record<string, unknown>
) {
  const supabase = await createClient()
  const socioId = await idSocioActual()
  const { data: socio } = socioId
    ? await supabase.from("socios").select("nombre").eq("id", socioId).maybeSingle()
    : { data: null }

  await supabase.from("ideas_versiones").insert({
    idea_id: ideaId,
    snapshot,
    autor: socio?.nombre ?? "Socio",
    autor_socio_id: socioId,
  })
}

export async function crearIdea(formData: FormData) {
  const datos = datosDesde(formData)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ideas")
    .insert({ ...datos, created_by: await idSocioActual() })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  await guardarVersion(data.id, datos)
  revalidatePath("/ideas")
}

export async function actualizarIdea(id: string, formData: FormData) {
  const datos = datosDesde(formData)
  const supabase = await createClient()
  const { error } = await supabase.from("ideas").update(datos).eq("id", id)
  if (error) throw new Error(error.message)
  await guardarVersion(id, datos)
  revalidatePath("/ideas")
  revalidatePath(`/ideas/${id}`)
}

export async function eliminarIdea(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("ideas")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/ideas")
}

export async function comentarIdea(ideaId: string, formData: FormData) {
  const cuerpo = (formData.get("cuerpo") as string | null)?.trim()
  if (!cuerpo) throw new Error("El comentario está vacío")

  const supabase = await createClient()
  const socioId = await idSocioActual()
  const { data: socio } = socioId
    ? await supabase.from("socios").select("nombre").eq("id", socioId).maybeSingle()
    : { data: null }

  const { error } = await supabase.from("ideas_comentarios").insert({
    idea_id: ideaId,
    cuerpo,
    autor: socio?.nombre ?? "Socio",
    autor_socio_id: socioId,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/ideas/${ideaId}`)
}

// Graduación (etapa 3): la idea aprobada se convierte en trabajo real.
// Quien gradúa elige el destino: un proyecto interno (con sus tareas
// colgando de él) para ideas grandes, o tareas sueltas del kanban para
// ideas chicas. Trazabilidad en ambos sentidos: la idea guarda qué generó
// (proyecto_id + metadata.graduacion) y cada tarea nace con el contexto y
// la etiqueta de la idea que la originó.
export async function graduarIdea(id: string, formData: FormData) {
  const destino =
    (formData.get("destino") as string | null) === "proyecto"
      ? ("proyecto" as const)
      : ("tareas" as const)
  const proyectoNombre = textoOpcional(formData.get("proyecto_nombre"))
  const titulosTareas = ((formData.get("tareas") as string | null) ?? "")
    .split("\n")
    .map((t) => t.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)

  if (destino === "proyecto" && !proyectoNombre) {
    throw new Error("El proyecto necesita un nombre")
  }
  if (destino === "tareas" && titulosTareas.length === 0) {
    throw new Error("Para graduar a tareas hace falta al menos una")
  }

  const supabase = await createClient()
  const { data: ideaData } = await supabase
    .from("ideas")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle()
  if (!ideaData) throw new Error("No existe la idea")
  const idea = ideaData as Idea

  const socioId = await idSocioActual()
  const codigo = codigoIdea(idea.numero)

  let proyectoId: string | null = null
  if (destino === "proyecto") {
    const { data: proyecto, error } = await supabase
      .from("proyectos")
      .insert({
        nombre: proyectoNombre,
        cliente_id: null,
        descripcion: `Proyecto interno graduado del banco de ideas (${codigo}: ${idea.titulo}).`,
        estado: "propuesta",
        metadata: { idea: codigo },
        created_by: socioId,
      })
      .select("id")
      .single()
    if (error) throw new Error(error.message)
    proyectoId = proyecto.id
  }

  // Las tareas entran arriba del backlog, en el orden en que se escribieron.
  const numerosTareas: number[] = []
  if (titulosTareas.length > 0) {
    const { data: tope } = await supabase
      .from("tareas")
      .select("orden")
      .eq("estado", "backlog")
      .is("deleted_at", null)
      .order("orden", { ascending: true })
      .limit(1)
      .maybeSingle()
    const base = (tope?.orden ?? 0) - titulosTareas.length

    const { data: creadas, error } = await supabase
      .from("tareas")
      .insert(
        titulosTareas.map((titulo, i) => ({
          titulo,
          estado: "backlog",
          prioridad: "media",
          proyecto_id: proyectoId,
          etiquetas: [codigo],
          contexto: `Sale de la idea ${codigo} ("${idea.titulo}") del banco de ideas, graduada como ${
            destino === "proyecto" ? "proyecto" : "tareas sueltas"
          }. El one-pager de la idea tiene el contexto completo.`,
          orden: base + i,
          created_by: socioId,
          metadata: { idea: codigo },
        }))
      )
      .select("numero")
    if (error) throw new Error(error.message)
    for (const t of creadas ?? []) numerosTareas.push(t.numero)
  }

  const { error } = await supabase
    .from("ideas")
    .update({
      estado: "aprobada",
      proyecto_id: proyectoId,
      metadata: {
        ...idea.metadata,
        graduacion: {
          destino,
          fecha: new Date().toISOString().slice(0, 10),
          tareas: numerosTareas,
        },
      },
    })
    .eq("id", id)
  if (error) throw new Error(error.message)

  await guardarVersion(id, {
    titulo: idea.titulo,
    descripcion: idea.descripcion,
    problema: idea.problema,
    competencia: idea.competencia,
    solucion: idea.solucion,
    esfuerzo: idea.esfuerzo,
    impacto: idea.impacto,
    proximos_pasos: idea.proximos_pasos,
    estado: "aprobada",
    etiquetas: idea.etiquetas,
  })

  revalidatePath("/ideas")
  revalidatePath(`/ideas/${id}`)
  revalidatePath("/tareas")
}

// Toggle del +1 del socio logueado.
export async function votarIdea(ideaId: string) {
  const socioId = await idSocioActual()
  if (!socioId) throw new Error("No se encontró el socio logueado")

  const supabase = await createClient()
  const { data: voto } = await supabase
    .from("ideas_votos")
    .select("id")
    .eq("idea_id", ideaId)
    .eq("socio_id", socioId)
    .maybeSingle()

  const { error } = voto
    ? await supabase.from("ideas_votos").delete().eq("id", voto.id)
    : await supabase
        .from("ideas_votos")
        .insert({ idea_id: ideaId, socio_id: socioId })
  if (error) throw new Error(error.message)
  revalidatePath("/ideas")
  revalidatePath(`/ideas/${ideaId}`)
}

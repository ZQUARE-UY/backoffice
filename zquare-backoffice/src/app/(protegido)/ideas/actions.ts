"use server"

import { revalidatePath } from "next/cache"

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

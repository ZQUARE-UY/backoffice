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
    estado: (formData.get("estado") as string | null) ?? "backlog",
    prioridad: (formData.get("prioridad") as string | null) ?? "media",
    asignado_a: textoOpcional(formData.get("asignado_a")),
    cliente_id: textoOpcional(formData.get("cliente_id")),
    proyecto_id: textoOpcional(formData.get("proyecto_id")),
    fecha_limite: textoOpcional(formData.get("fecha_limite")),
    etiquetas: etiquetas
      ? etiquetas
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean)
      : [],
  }
}

// Las tarjetas nuevas entran arriba de su columna: `orden` menor que el mínimo
// actual. Ver la migración para por qué `orden` es numeric.
async function ordenAlTope(estado: string): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("tareas")
    .select("orden")
    .eq("estado", estado)
    .is("deleted_at", null)
    .order("orden", { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data?.orden ?? 0) - 1
}

export async function crearTarea(formData: FormData) {
  const datos = datosDesde(formData)
  const supabase = await createClient()
  const { error } = await supabase.from("tareas").insert({
    ...datos,
    orden: await ordenAlTope(datos.estado),
    created_by: await idSocioActual(),
  })
  if (error) throw new Error(error.message)
  revalidatePath("/tareas")
}

export async function actualizarTarea(id: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("tareas")
    .update(datosDesde(formData))
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/tareas")
}

// Mover una tarjeta: nueva columna y posición dentro de ella. `orden` lo calcula
// el tablero como punto medio entre las dos vecinas, así solo se toca esta fila.
export async function moverTarea(id: string, estado: string, orden: number) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("tareas")
    .update({ estado, orden })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/tareas")
}

export async function eliminarTarea(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("tareas")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/tareas")
}

export async function comentarTarea(tareaId: string, formData: FormData) {
  const cuerpo = (formData.get("cuerpo") as string | null)?.trim()
  if (!cuerpo) throw new Error("El comentario está vacío")

  const supabase = await createClient()
  const socioId = await idSocioActual()
  const { data: socio } = socioId
    ? await supabase.from("socios").select("nombre").eq("id", socioId).maybeSingle()
    : { data: null }

  const { error } = await supabase.from("tareas_comentarios").insert({
    tarea_id: tareaId,
    cuerpo,
    autor: socio?.nombre ?? "Socio",
    autor_socio_id: socioId,
  })
  if (error) throw new Error(error.message)
  revalidatePath("/tareas")
}

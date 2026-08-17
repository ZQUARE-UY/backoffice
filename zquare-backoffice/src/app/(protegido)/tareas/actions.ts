"use server"

import { revalidatePath } from "next/cache"

import { RE_CODIGO_PROYECTO, RE_EPICA } from "@/lib/dominio"
import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"

function textoOpcional(valor: FormDataEntryValue | null): string | null {
  const t = (valor as string | null)?.trim()
  return t ? t : null
}

// Los códigos se guardan en mayúsculas para que "us-14" y "US-14" no terminen
// siendo dos códigos distintos que parecen el mismo. Se valida acá además de
// en la base: el check constraint devuelve un error de Postgres ilegible, y
// este mensaje dice qué se esperaba.
function codigoOpcional(
  valor: FormDataEntryValue | null,
  patron: RegExp,
  ejemplo: string
): string | null {
  const t = textoOpcional(valor)?.toUpperCase() ?? null
  if (t && !patron.test(t)) {
    throw new Error(`"${t}" no tiene el formato esperado (ej. ${ejemplo})`)
  }
  return t
}

function estimacionOpcional(valor: FormDataEntryValue | null): number | null {
  const t = textoOpcional(valor)
  return t ? Number(t) : null
}

function datosDesde(formData: FormData) {
  const titulo = (formData.get("titulo") as string | null)?.trim()
  if (!titulo) throw new Error("El título es obligatorio")
  const etiquetas = textoOpcional(formData.get("etiquetas"))
  return {
    titulo,
    descripcion: textoOpcional(formData.get("descripcion")),
    contexto: textoOpcional(formData.get("contexto")),
    resultado: textoOpcional(formData.get("resultado")),
    recursos: textoOpcional(formData.get("recursos")),
    plan: textoOpcional(formData.get("plan")),
    estado: (formData.get("estado") as string | null) ?? "backlog",
    prioridad: (formData.get("prioridad") as string | null) ?? "media",
    codigo_proyecto: codigoOpcional(
      formData.get("codigo_proyecto"),
      RE_CODIGO_PROYECTO,
      "US-014"
    ),
    estimacion: estimacionOpcional(formData.get("estimacion")),
    moscow: textoOpcional(formData.get("moscow")),
    epica: codigoOpcional(formData.get("epica"), RE_EPICA, "EP-3"),
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

// Historial de co-edición: cada creación/edición deja un snapshot del
// contenido con su autor (los movimientos de columna/orden no versionan).
// Explícito (no trigger) para poder atribuirlo, igual que en ideas.
async function guardarVersion(
  tareaId: string,
  snapshot: Record<string, unknown>
) {
  const supabase = await createClient()
  const socioId = await idSocioActual()
  const { data: socio } = socioId
    ? await supabase.from("socios").select("nombre").eq("id", socioId).maybeSingle()
    : { data: null }

  await supabase.from("tareas_versiones").insert({
    tarea_id: tareaId,
    snapshot,
    autor: socio?.nombre ?? "Socio",
    autor_socio_id: socioId,
  })
}

export async function crearTarea(formData: FormData) {
  const datos = datosDesde(formData)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("tareas")
    .insert({
      ...datos,
      orden: await ordenAlTope(datos.estado),
      created_by: await idSocioActual(),
    })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  await guardarVersion(data.id, datos)
  revalidatePath("/tareas")
}

export async function actualizarTarea(id: string, formData: FormData) {
  const datos = datosDesde(formData)
  const supabase = await createClient()
  // Si la edición cambia la columna, la tarjeta entra al tope de la nueva (igual
  // que el MCP); si no, conserva su posición: sin esto heredaría un `orden` de
  // otra columna y aterrizaría en cualquier lado.
  const { data: actual } = await supabase
    .from("tareas")
    .select("estado")
    .eq("id", id)
    .maybeSingle()
  const cambios =
    actual && actual.estado !== datos.estado
      ? { ...datos, orden: await ordenAlTope(datos.estado) }
      : datos
  const { error } = await supabase.from("tareas").update(cambios).eq("id", id)
  if (error) throw new Error(error.message)
  await guardarVersion(id, datos)
  revalidatePath("/tareas")
}

// "Pasar al tablero" desde la vista Backlog: la tarjeta se compromete y entra
// arriba de Por hacer. Server-side porque el backlog no conoce los `orden` de
// esa columna.
export async function pasarAlTablero(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("tareas")
    .update({ estado: "por_hacer", orden: await ordenAlTope("por_hacer") })
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

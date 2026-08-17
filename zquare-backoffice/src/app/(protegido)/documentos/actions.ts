"use server"

import { revalidatePath } from "next/cache"

import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"

function textoOpcional(valor: FormDataEntryValue | null): string | null {
  const t = (valor as string | null)?.trim()
  return t ? t : null
}

// El id del archivo dentro de un link de Drive. Los dos formatos que aparecen
// son `/d/<id>/` (archivos y docs nativos) y `?id=<id>` (links viejos). Sin
// esto la ficha queda desenganchada del archivo y no se puede cruzar con
// Drive ni con el índice de búsqueda — la misma lógica que el backfill de la
// migración 20260817000002.
function fileIdDeUrl(url: string): string | null {
  return (
    url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ??
    url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ??
    null
  )
}

function parseTags(valor: FormDataEntryValue | null): string[] {
  const t = (valor as string | null)?.trim()
  if (!t) return []
  return t
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function crearDocumento(formData: FormData) {
  const clienteId = formData.get("cliente_id") as string
  const titulo = (formData.get("titulo") as string | null)?.trim()
  const driveUrl = (formData.get("drive_url") as string | null)?.trim()
  if (!clienteId) throw new Error("Falta el cliente")
  if (!titulo) throw new Error("El título es obligatorio")
  if (!driveUrl) throw new Error("El link al documento es obligatorio")

  const supabase = await createClient()
  const { error } = await supabase.from("documentos").insert({
    cliente_id: clienteId,
    proyecto_id: textoOpcional(formData.get("proyecto_id")),
    tipo: (formData.get("tipo") as string) || "otro",
    titulo,
    drive_url: driveUrl,
    drive_file_id: fileIdDeUrl(driveUrl),
    tags: parseTags(formData.get("tags")),
    fecha: textoOpcional(formData.get("fecha")) ?? undefined,
    subido_por: await idSocioActual(),
  })

  if (error) throw new Error(error.message)
  revalidatePath(`/clientes/${clienteId}`)
}

export async function actualizarDocumento(
  id: string,
  // Null en los archivos anotados sin cliente: solo se usa para revalidar la
  // ficha del cliente cuando la hay.
  clienteId: string | null,
  formData: FormData
) {
  const titulo = (formData.get("titulo") as string | null)?.trim()
  const driveUrl = (formData.get("drive_url") as string | null)?.trim()
  if (!titulo) throw new Error("El título es obligatorio")
  if (!driveUrl) throw new Error("El link al documento es obligatorio")

  const supabase = await createClient()
  const { error } = await supabase
    .from("documentos")
    .update({
      proyecto_id: textoOpcional(formData.get("proyecto_id")),
      tipo: (formData.get("tipo") as string) || "otro",
      titulo,
      drive_url: driveUrl,
      drive_file_id: fileIdDeUrl(driveUrl),
      tags: parseTags(formData.get("tags")),
      fecha: textoOpcional(formData.get("fecha")) ?? undefined,
    })
    .eq("id", id)

  if (error) throw new Error(error.message)
  revalidatePath("/documentos")
  if (clienteId) revalidatePath(`/clientes/${clienteId}`)
}

// Anota un archivo de Drive desde /documentos: le pone tipo, dueño y tags sin
// que nadie haya tenido que "registrarlo" antes. La clave es el file id, así
// que anotar dos veces el mismo archivo actualiza la anotación en vez de
// duplicarla (el índice único de la migración 20260817000002 lo garantiza).
export async function anotarArchivo(formData: FormData) {
  const driveFileId = (formData.get("drive_file_id") as string | null)?.trim()
  const titulo = (formData.get("titulo") as string | null)?.trim()
  const driveUrl = (formData.get("drive_url") as string | null)?.trim()
  if (!driveFileId) throw new Error("Falta el archivo de Drive")
  if (!titulo) throw new Error("El título es obligatorio")
  if (!driveUrl) throw new Error("Falta el link al archivo")

  const supabase = await createClient()
  const { data: existente } = await supabase
    .from("documentos")
    .select("id")
    .eq("drive_file_id", driveFileId)
    .is("deleted_at", null)
    .maybeSingle()

  const campos = {
    cliente_id: textoOpcional(formData.get("cliente_id")),
    proyecto_id: textoOpcional(formData.get("proyecto_id")),
    tipo: (formData.get("tipo") as string) || "otro",
    titulo,
    tags: parseTags(formData.get("tags")),
    fecha: textoOpcional(formData.get("fecha")) ?? undefined,
  }

  const { error } = existente
    ? await supabase.from("documentos").update(campos).eq("id", existente.id)
    : await supabase.from("documentos").insert({
        ...campos,
        drive_file_id: driveFileId,
        drive_url: driveUrl,
        subido_por: await idSocioActual(),
      })

  if (error) throw new Error(error.message)
  revalidatePath("/documentos")
  if (campos.cliente_id) revalidatePath(`/clientes/${campos.cliente_id}`)
}

// Quita la anotación sin tocar el archivo: en Drive sigue estando, y en la
// lista vuelve a aparecer como "sin anotar".
export async function quitarAnotacion(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("documentos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/documentos")
}

export async function eliminarDocumento(id: string, clienteId: string | null) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("documentos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/documentos")
  if (clienteId) revalidatePath(`/clientes/${clienteId}`)
}

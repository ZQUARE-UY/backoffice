"use server"

import { revalidatePath } from "next/cache"

import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"

function textoOpcional(valor: FormDataEntryValue | null): string | null {
  const t = (valor as string | null)?.trim()
  return t ? t : null
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
    tags: parseTags(formData.get("tags")),
    fecha: textoOpcional(formData.get("fecha")) ?? undefined,
    subido_por: await idSocioActual(),
  })

  if (error) throw new Error(error.message)
  revalidatePath(`/clientes/${clienteId}`)
}

export async function actualizarDocumento(
  id: string,
  clienteId: string,
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
      tags: parseTags(formData.get("tags")),
      fecha: textoOpcional(formData.get("fecha")) ?? undefined,
    })
    .eq("id", id)

  if (error) throw new Error(error.message)
  revalidatePath(`/clientes/${clienteId}`)
}

export async function eliminarDocumento(id: string, clienteId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("documentos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath(`/clientes/${clienteId}`)
}

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
  return {
    titulo,
    detalle: textoOpcional(formData.get("detalle")),
    fecha: textoOpcional(formData.get("fecha")) ?? undefined,
    participantes: formData.getAll("participantes").map((p) => p as string),
    cliente_id: textoOpcional(formData.get("cliente_id")),
  }
}

export async function crearDecision(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.from("decisiones").insert({
    ...datosDesde(formData),
    created_by: await idSocioActual(),
  })
  if (error) throw new Error(error.message)
  revalidatePath("/decisiones")
}

export async function actualizarDecision(id: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("decisiones")
    .update(datosDesde(formData))
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/decisiones")
}

export async function eliminarDecision(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("decisiones")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/decisiones")
}

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
    reunion_id: textoOpcional(formData.get("reunion_id")),
  }
}

// Si la decisión salió de una reunión y no se eligió cliente, hereda el de la
// reunión (y, al crearla, también su proyecto): así aparece en la ficha del
// cliente sin cargarlo dos veces.
async function conDatosDeReunion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  datos: ReturnType<typeof datosDesde>,
  alCrear: boolean
) {
  if (!datos.reunion_id) return datos
  const { data: reunion } = await supabase
    .from("solicitudes_reunion")
    .select("cliente_id, proyecto_id")
    .eq("id", datos.reunion_id)
    .maybeSingle()
  if (!reunion) throw new Error("La reunión elegida no existe")
  return {
    ...datos,
    cliente_id: datos.cliente_id ?? reunion.cliente_id,
    ...(alCrear && reunion.proyecto_id ? { proyecto_id: reunion.proyecto_id as string } : {}),
  }
}

export async function crearDecision(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.from("decisiones").insert({
    ...(await conDatosDeReunion(supabase, datosDesde(formData), true)),
    created_by: await idSocioActual(),
  })
  if (error) throw new Error(error.message)
  revalidatePath("/decisiones")
}

export async function actualizarDecision(id: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("decisiones")
    .update(await conDatosDeReunion(supabase, datosDesde(formData), false))
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

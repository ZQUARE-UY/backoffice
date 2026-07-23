"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"

function textoOpcional(valor: FormDataEntryValue | null): string | null {
  const t = (valor as string | null)?.trim()
  return t ? t : null
}

function numeroOpcional(valor: FormDataEntryValue | null): number | null {
  const t = (valor as string | null)?.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export async function crearCliente(formData: FormData) {
  const nombre = (formData.get("nombre") as string | null)?.trim()
  if (!nombre) throw new Error("El nombre es obligatorio")

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("clientes")
    .insert({
      nombre,
      empresa: textoOpcional(formData.get("empresa")),
      email: textoOpcional(formData.get("email")),
      telefono: textoOpcional(formData.get("telefono")),
      estado: (formData.get("estado") as string) || "potencial",
      origen: textoOpcional(formData.get("origen")),
      notas: textoOpcional(formData.get("notas")),
      created_by: await idSocioActual(),
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)

  revalidatePath("/clientes")
  redirect(`/clientes/${data.id}`)
}

export async function actualizarCliente(id: string, formData: FormData) {
  const nombre = (formData.get("nombre") as string | null)?.trim()
  if (!nombre) throw new Error("El nombre es obligatorio")

  const supabase = await createClient()
  const { error } = await supabase
    .from("clientes")
    .update({
      nombre,
      empresa: textoOpcional(formData.get("empresa")),
      email: textoOpcional(formData.get("email")),
      telefono: textoOpcional(formData.get("telefono")),
      estado: (formData.get("estado") as string) || "potencial",
      origen: textoOpcional(formData.get("origen")),
      notas: textoOpcional(formData.get("notas")),
    })
    .eq("id", id)

  if (error) throw new Error(error.message)

  revalidatePath("/clientes")
  revalidatePath(`/clientes/${id}`)
}

export async function actualizarProyecto(id: string, formData: FormData) {
  const nombre = (formData.get("nombre") as string | null)?.trim()
  if (!nombre) throw new Error("El nombre es obligatorio")

  const supabase = await createClient()
  const { error } = await supabase
    .from("proyectos")
    .update({
      nombre,
      descripcion: textoOpcional(formData.get("descripcion")),
      estado: (formData.get("estado") as string) || "propuesta",
      fecha_inicio: textoOpcional(formData.get("fecha_inicio")),
      fecha_fin_estimada: textoOpcional(formData.get("fecha_fin_estimada")),
      fecha_fin_real: textoOpcional(formData.get("fecha_fin_real")),
      horas_estimadas: numeroOpcional(formData.get("horas_estimadas")),
      horas_reales: numeroOpcional(formData.get("horas_reales")),
      monto_acordado: numeroOpcional(formData.get("monto_acordado")),
      moneda: textoOpcional(formData.get("moneda")),
    })
    .eq("id", id)

  if (error) throw new Error(error.message)

  revalidatePath(`/proyectos/${id}`)
}

export async function crearProyecto(formData: FormData) {
  const clienteId = formData.get("cliente_id") as string
  const nombre = (formData.get("nombre") as string | null)?.trim()
  if (!clienteId) throw new Error("Falta el cliente")
  if (!nombre) throw new Error("El nombre es obligatorio")

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("proyectos")
    .insert({
      cliente_id: clienteId,
      nombre,
      descripcion: textoOpcional(formData.get("descripcion")),
      estado: (formData.get("estado") as string) || "propuesta",
      fecha_inicio: textoOpcional(formData.get("fecha_inicio")),
      fecha_fin_estimada: textoOpcional(formData.get("fecha_fin_estimada")),
      horas_estimadas: numeroOpcional(formData.get("horas_estimadas")),
      monto_acordado: numeroOpcional(formData.get("monto_acordado")),
      moneda: textoOpcional(formData.get("moneda")),
      created_by: await idSocioActual(),
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)

  revalidatePath(`/clientes/${clienteId}`)
  redirect(`/proyectos/${data.id}`)
}

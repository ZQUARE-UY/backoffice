"use server"

import { revalidatePath } from "next/cache"

import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"

function textoOpcional(valor: FormDataEntryValue | null): string | null {
  const t = (valor as string | null)?.trim()
  return t ? t : null
}

function numero(valor: FormDataEntryValue | null): number {
  const n = Number((valor as string | null)?.replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

function datosDesde(formData: FormData) {
  const tipo = formData.get("tipo") as string | null
  if (!tipo) throw new Error("El tipo es obligatorio")

  const monto = numero(formData.get("monto"))
  if (monto <= 0) throw new Error("El monto debe ser mayor a 0")

  const moneda = ((formData.get("moneda") as string) || "USD") as "USD" | "UYU"
  // Para USD el tipo de cambio es siempre 1; para UYU se toma el ingresado.
  const tcIngresado = numero(formData.get("tc_a_usd"))
  const tc_a_usd = moneda === "USD" ? 1 : tcIngresado
  if (tc_a_usd <= 0) throw new Error("El tipo de cambio debe ser mayor a 0")

  return {
    tipo,
    fecha: textoOpcional(formData.get("fecha")) ?? undefined,
    moneda,
    monto,
    tc_a_usd,
    categoria: textoOpcional(formData.get("categoria")),
    descripcion: textoOpcional(formData.get("descripcion")),
    socio_id: textoOpcional(formData.get("socio_id")),
    cliente_id: textoOpcional(formData.get("cliente_id")),
    comprobante_url: textoOpcional(formData.get("comprobante_url")),
  }
}

export async function crearMovimiento(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.from("movimientos").insert({
    ...datosDesde(formData),
    created_by: await idSocioActual(),
  })
  if (error) throw new Error(error.message)
  revalidatePath("/finanzas")
}

export async function actualizarMovimiento(id: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("movimientos")
    .update(datosDesde(formData))
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/finanzas")
}

export async function eliminarMovimiento(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("movimientos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/finanzas")
}

"use server"

import { revalidatePath } from "next/cache"

import { FONDO_COMUN } from "@/lib/dominio"
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

  // Quién puso la plata (gasto) o quién la cobró (ingreso): un socio o el
  // fondo común (socio_id NULL). Vale para los dos tipos: un socio puede
  // cobrarle a un cliente en su cuenta personal.
  const deQuien = textoOpcional(formData.get("pagado_por"))
  const socio_id = deQuien && deQuien !== FONDO_COMUN ? deQuien : null

  const estado = (formData.get("estado") as string) || "confirmado"
  if (estado !== "previsto" && estado !== "confirmado") {
    throw new Error("Estado de movimiento inválido")
  }

  return {
    tipo,
    estado,
    fecha: textoOpcional(formData.get("fecha")) ?? undefined,
    moneda,
    monto,
    tc_a_usd,
    categoria: textoOpcional(formData.get("categoria")),
    descripcion: textoOpcional(formData.get("descripcion")),
    socio_id,
    cliente_id: textoOpcional(formData.get("cliente_id")),
    proyecto_id: textoOpcional(formData.get("proyecto_id")),
    comprobante_url: textoOpcional(formData.get("comprobante_url")),
  }
}

// Entre quiénes se reparte el movimiento. Solo tiene sentido cuando lo puso o
// lo cobró un socio: lo del fondo común no le genera deuda a nadie, así que en
// ese caso se guarda sin participaciones.
function repartoDesde(formData: FormData, socioId: string | null) {
  if (!socioId) return []
  const socios = formData.getAll("participante").map(String)
  if (socios.length === 0) {
    throw new Error("Elegí entre quiénes se reparte el movimiento")
  }
  return socios.map((socio_id) => {
    const partes = numero(formData.get(`partes_${socio_id}`))
    if (partes <= 0) throw new Error("Las partes deben ser mayores a 0")
    return { socio_id, partes }
  })
}

async function guardarReparto(
  movimientoId: string,
  reparto: { socio_id: string; partes: number }[],
) {
  const supabase = await createClient()
  // Se reemplaza entero: es la forma más simple de que editar no deje filas
  // viejas de un socio que se sacó del reparto.
  const { error: errorBorrado } = await supabase
    .from("movimiento_participaciones")
    .delete()
    .eq("movimiento_id", movimientoId)
  if (errorBorrado) throw new Error(errorBorrado.message)
  if (reparto.length === 0) return
  const { error } = await supabase
    .from("movimiento_participaciones")
    .insert(reparto.map((r) => ({ ...r, movimiento_id: movimientoId })))
  if (error) throw new Error(error.message)
}

export async function crearMovimiento(formData: FormData) {
  const supabase = await createClient()
  const datos = datosDesde(formData)
  const reparto = repartoDesde(formData, datos.socio_id)
  const { data, error } = await supabase
    .from("movimientos")
    .insert({ ...datos, created_by: await idSocioActual() })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  await guardarReparto(data.id, reparto)
  revalidatePath("/finanzas")
}

export async function actualizarMovimiento(id: string, formData: FormData) {
  const supabase = await createClient()
  const datos = datosDesde(formData)
  const reparto = repartoDesde(formData, datos.socio_id)
  const { error } = await supabase
    .from("movimientos")
    .update(datos)
    .eq("id", id)
  if (error) throw new Error(error.message)
  await guardarReparto(id, reparto)
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

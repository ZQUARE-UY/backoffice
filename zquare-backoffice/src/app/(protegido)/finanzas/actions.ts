"use server"

import { revalidatePath } from "next/cache"

import { FONDO_COMUN } from "@/lib/dominio"
import { borrarPrevistosFuturos, sincronizarRecurrentes } from "@/lib/finanzas"
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

// Campos que comparten un movimiento y una plantilla recurrente: qué es,
// cuánto, de quién y de qué cliente/proyecto.
function camposComunes(formData: FormData) {
  const tipo = formData.get("tipo") as string | null
  if (tipo !== "ingreso" && tipo !== "gasto") {
    throw new Error("El tipo es obligatorio")
  }

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

  return {
    tipo,
    moneda,
    monto,
    tc_a_usd,
    categoria: textoOpcional(formData.get("categoria")),
    descripcion: textoOpcional(formData.get("descripcion")),
    socio_id,
    cliente_id: textoOpcional(formData.get("cliente_id")),
    proyecto_id: textoOpcional(formData.get("proyecto_id")),
  }
}

function datosDesde(formData: FormData) {
  const estado = (formData.get("estado") as string) || "confirmado"
  if (estado !== "previsto" && estado !== "confirmado") {
    throw new Error("Estado de movimiento inválido")
  }

  return {
    ...camposComunes(formData),
    estado,
    fecha: textoOpcional(formData.get("fecha")) ?? undefined,
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

// ── Movimientos recurrentes ─────────────────────────────────────────────────

function recurrenteDesde(formData: FormData) {
  const comunes = camposComunes(formData)
  if (!comunes.descripcion) {
    throw new Error("Poné una descripción (ej. Google Workspace)")
  }

  const frecuencia = formData.get("frecuencia") as string | null
  if (frecuencia !== "mensual" && frecuencia !== "anual") {
    throw new Error("La frecuencia es obligatoria")
  }
  const fecha_inicio = textoOpcional(formData.get("fecha_inicio"))
  if (!fecha_inicio) throw new Error("La fecha del primer cobro es obligatoria")
  const fecha_fin = textoOpcional(formData.get("fecha_fin"))
  if (fecha_fin && fecha_fin < fecha_inicio) {
    throw new Error("La fecha de fin no puede ser anterior al primer cobro")
  }

  return {
    ...comunes,
    frecuencia,
    fecha_inicio,
    fecha_fin,
    reparto: repartoDesde(formData, comunes.socio_id),
  }
}

// Después de tocar una plantilla: los previstos futuros se regeneran con los
// datos nuevos, y si el primer cobro ya pasó, se generan los vencidos.
async function resincronizar(recurrenteId: string) {
  const supabase = await createClient()
  await borrarPrevistosFuturos(supabase, recurrenteId)
  const { errores } = await sincronizarRecurrentes(supabase)
  if (errores.length > 0) throw new Error(errores.join("; "))
  revalidatePath("/finanzas")
}

export async function crearRecurrente(formData: FormData) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("movimientos_recurrentes")
    .insert({ ...recurrenteDesde(formData), created_by: await idSocioActual() })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  await resincronizar(data.id)
}

export async function actualizarRecurrente(id: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("movimientos_recurrentes")
    .update(recurrenteDesde(formData))
    .eq("id", id)
  if (error) throw new Error(error.message)
  await resincronizar(id)
}

export async function pausarRecurrente(id: string, activo: boolean) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("movimientos_recurrentes")
    .update({ activo })
    .eq("id", id)
  if (error) throw new Error(error.message)
  await resincronizar(id)
}

// Borrar la plantilla no toca lo que ya se cobró: esos movimientos son
// registros reales. Solo desaparece el previsto de la próxima ocurrencia.
export async function eliminarRecurrente(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("movimientos_recurrentes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
  await resincronizar(id)
}

// ── Liquidaciones entre socios ──────────────────────────────────────────────

export async function crearLiquidacion(formData: FormData) {
  const de_socio_id = textoOpcional(formData.get("de_socio_id"))
  const para_socio_id = textoOpcional(formData.get("para_socio_id"))
  if (!de_socio_id || !para_socio_id) {
    throw new Error("Elegí quién transfiere y quién recibe")
  }
  if (de_socio_id === para_socio_id) {
    throw new Error("Quién transfiere y quién recibe tienen que ser distintos")
  }

  const monto = numero(formData.get("monto"))
  if (monto <= 0) throw new Error("El monto debe ser mayor a 0")
  const moneda = ((formData.get("moneda") as string) || "USD") as "USD" | "UYU"
  const tc_a_usd = moneda === "USD" ? 1 : numero(formData.get("tc_a_usd"))
  if (tc_a_usd <= 0) throw new Error("El tipo de cambio debe ser mayor a 0")

  const supabase = await createClient()
  const { error } = await supabase.from("liquidaciones").insert({
    de_socio_id,
    para_socio_id,
    monto,
    moneda,
    tc_a_usd,
    fecha: textoOpcional(formData.get("fecha")) ?? undefined,
    nota: textoOpcional(formData.get("nota")),
    comprobante_url: textoOpcional(formData.get("comprobante_url")),
    created_by: await idSocioActual(),
  })
  if (error) throw new Error(error.message)
  revalidatePath("/finanzas")
  revalidatePath("/")
}

export async function eliminarLiquidacion(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("liquidaciones")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/finanzas")
  revalidatePath("/")
}

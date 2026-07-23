"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"

function textoOpcional(valor: FormDataEntryValue | null): string | null {
  const t = (valor as string | null)?.trim()
  return t ? t : null
}

export type ItemEntrada = {
  descripcion: string
  horas: number | null
  tarifa: number
}

// Subtotal por ítem: si tiene horas, es horas × tarifa; si no, la tarifa es el
// precio directo del ítem (precio fijo).
function calcularSubtotal(item: ItemEntrada): number {
  const tarifa = Number.isFinite(item.tarifa) ? item.tarifa : 0
  if (item.horas != null && Number.isFinite(item.horas)) {
    return Math.round(item.horas * tarifa * 100) / 100
  }
  return Math.round(tarifa * 100) / 100
}

export async function crearPresupuesto(formData: FormData) {
  const clienteId = formData.get("cliente_id") as string
  if (!clienteId) throw new Error("Falta el cliente")

  const supabase = await createClient()

  // Siguiente versión: max existente para el cliente + 1.
  const { data: previos } = await supabase
    .from("presupuestos")
    .select("version")
    .eq("cliente_id", clienteId)
    .is("deleted_at", null)
    .order("version", { ascending: false })
    .limit(1)
  const version = (previos?.[0]?.version ?? 0) + 1

  const { data, error } = await supabase
    .from("presupuestos")
    .insert({
      cliente_id: clienteId,
      proyecto_id: textoOpcional(formData.get("proyecto_id")),
      version,
      moneda: (formData.get("moneda") as string) || "USD",
      notas: textoOpcional(formData.get("notas")),
      created_by: await idSocioActual(),
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)

  revalidatePath(`/clientes/${clienteId}`)
  redirect(`/presupuestos/${data.id}`)
}

export async function actualizarPresupuesto(id: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("presupuestos")
    .update({
      estado: (formData.get("estado") as string) || "borrador",
      moneda: (formData.get("moneda") as string) || "USD",
      fecha_envio: textoOpcional(formData.get("fecha_envio")),
      drive_url: textoOpcional(formData.get("drive_url")),
      notas: textoOpcional(formData.get("notas")),
    })
    .eq("id", id)

  if (error) throw new Error(error.message)
  revalidatePath(`/presupuestos/${id}`)
}

export async function guardarItems(presupuestoId: string, items: ItemEntrada[]) {
  const supabase = await createClient()

  const limpios = items
    .map((it) => ({
      descripcion: it.descripcion?.trim() ?? "",
      horas: it.horas,
      tarifa: it.tarifa,
    }))
    .filter((it) => it.descripcion.length > 0)

  const filas = limpios.map((it, i) => ({
    presupuesto_id: presupuestoId,
    descripcion: it.descripcion,
    horas: it.horas,
    tarifa: it.tarifa,
    subtotal: calcularSubtotal(it),
    orden: i,
  }))

  const total = filas.reduce((acc, f) => acc + f.subtotal, 0)

  // Reemplazo el set completo: borro los ítems existentes e inserto los nuevos.
  const { error: errDel } = await supabase
    .from("presupuesto_items")
    .delete()
    .eq("presupuesto_id", presupuestoId)
  if (errDel) throw new Error(errDel.message)

  if (filas.length > 0) {
    const { error: errIns } = await supabase
      .from("presupuesto_items")
      .insert(filas)
    if (errIns) throw new Error(errIns.message)
  }

  const { error: errTot } = await supabase
    .from("presupuestos")
    .update({ total: Math.round(total * 100) / 100 })
    .eq("id", presupuestoId)
  if (errTot) throw new Error(errTot.message)

  revalidatePath(`/presupuestos/${presupuestoId}`)
}

export async function eliminarPresupuesto(id: string, clienteId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("presupuestos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw new Error(error.message)

  revalidatePath(`/clientes/${clienteId}`)
  redirect(`/clientes/${clienteId}`)
}

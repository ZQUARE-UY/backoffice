"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import {
  congelarDocumentoEnviado,
  generarDocumentoPresupuesto,
} from "@/lib/documento-presupuesto"
import { TIPOS_PROYECTO } from "@/lib/dominio"
import { calcularSubtotal } from "@/lib/presupuestos"
import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"

function textoOpcional(valor: FormDataEntryValue | null): string | null {
  const t = (valor as string | null)?.trim()
  return t ? t : null
}

function numeroOpcional(valor: FormDataEntryValue | null): number | null {
  const t = textoOpcional(valor)
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function tipoOpcional(valor: FormDataEntryValue | null): string | null {
  const t = textoOpcional(valor)
  return t && t in TIPOS_PROYECTO ? t : null
}

export type ItemEntrada = {
  descripcion: string
  horas: number | null
  horas_internas: number | null
  tarifa: number
}

export async function crearPresupuesto(formData: FormData) {
  const clienteId = formData.get("cliente_id") as string
  if (!clienteId) throw new Error("Falta el cliente")

  const supabase = await createClient()

  // Un presupuesto nuevo es la versión 1 de su propuesta. Las siguientes
  // versiones apuntan a la anterior con `version_de` (ver la migración
  // 20260930000001); no se numeran por cliente.
  const { data, error } = await supabase
    .from("presupuestos")
    .insert({
      cliente_id: clienteId,
      proyecto_id: textoOpcional(formData.get("proyecto_id")),
      titulo: textoOpcional(formData.get("titulo")),
      version: 1,
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
  const { data: previo } = await supabase
    .from("presupuestos")
    .select("estado")
    .eq("id", id)
    .maybeSingle()
  const { error } = await supabase
    .from("presupuestos")
    .update({
      titulo: textoOpcional(formData.get("titulo")),
      tipo: tipoOpcional(formData.get("tipo")),
      estado: (formData.get("estado") as string) || "borrador",
      moneda: (formData.get("moneda") as string) || "USD",
      plazo_estimado_semanas: numeroOpcional(formData.get("plazo_estimado_semanas")),
      fecha_envio: textoOpcional(formData.get("fecha_envio")),
      fecha_respuesta: textoOpcional(formData.get("fecha_respuesta")),
      motivo_resultado: textoOpcional(formData.get("motivo_resultado")),
      drive_url: textoOpcional(formData.get("drive_url")),
      contenido: textoOpcional(formData.get("contenido")),
      notas: textoOpcional(formData.get("notas")),
      etiquetas: (textoOpcional(formData.get("etiquetas")) ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    })
    .eq("id", id)

  if (error) throw new Error(error.message)

  // Recién enviado: se guarda el PDF de lo que se mandó. Si falla, el cambio
  // de estado igual queda; el PDF se puede reintentar volviendo a guardar.
  if (formData.get("estado") === "enviado" && previo?.estado !== "enviado") {
    try {
      await congelarDocumentoEnviado(supabase, id)
    } catch (e) {
      console.error("No se pudo guardar el PDF del presupuesto enviado:", e)
    }
  }
  revalidatePath(`/presupuestos/${id}`)
}

export async function generarDocumento(
  id: string
): Promise<{ url: string; regenerado: boolean } | { error: string }> {
  if (!(await idSocioActual())) return { error: "No autorizado" }
  try {
    const { url, regenerado } = await generarDocumentoPresupuesto(await createClient(), id)
    revalidatePath(`/presupuestos/${id}`)
    return { url, regenerado }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo generar el documento" }
  }
}

export async function guardarItems(presupuestoId: string, items: ItemEntrada[]) {
  const supabase = await createClient()

  const limpios = items
    .map((it) => ({
      descripcion: it.descripcion?.trim() ?? "",
      horas: it.horas,
      horas_internas: it.horas_internas,
      tarifa: it.tarifa,
    }))
    .filter((it) => it.descripcion.length > 0)

  const filas = limpios.map((it, i) => ({
    presupuesto_id: presupuestoId,
    descripcion: it.descripcion,
    horas: it.horas,
    horas_internas: it.horas_internas,
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

"use server"

import { revalidatePath } from "next/cache"

import {
  FORMATO_FECHA,
  FORMATO_HORA,
  instanteEnZona,
} from "@/lib/disponibilidad"
import type { FranjaGuardada } from "@/lib/dominio"
import {
  agendarSolicitud,
  cancelarSolicitud as cancelarEnBase,
  eliminarSolicitud as eliminarEnBase,
  guardarRespuestaDe,
  reabrirSolicitud as reabrirEnBase,
} from "@/lib/reuniones"
import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"

// Refresca la lista, el detalle y el layout (el badge de pendientes del
// sidebar vive ahí).
function refrescar(solicitudId?: string) {
  revalidatePath("/reuniones")
  if (solicitudId) revalidatePath(`/reuniones/${solicitudId}`)
  revalidatePath("/", "layout")
}

function textoOpcional(valor: FormDataEntryValue | null): string | null {
  const t = (valor as string | null)?.trim()
  return t ? t : null
}

function datosDesde(formData: FormData) {
  const titulo = (formData.get("titulo") as string | null)?.trim()
  if (!titulo) throw new Error("El título es obligatorio")

  const desde = (formData.get("ventana_desde") as string | null)?.trim()
  const hasta = (formData.get("ventana_hasta") as string | null)?.trim()
  if (!desde || !hasta) throw new Error("Hay que elegir los días candidatos")
  if (hasta < desde) {
    throw new Error("El último día no puede ser anterior al primero")
  }

  const requeridos = formData.getAll("socios_requeridos") as string[]
  if (requeridos.length === 0) {
    throw new Error("Elegí al menos un socio para la reunión")
  }

  const duracion = Number(formData.get("duracion_min") ?? 30)
  if (duracion !== 30 && duracion !== 60) {
    throw new Error("La duración tiene que ser de 30 o 60 minutos")
  }

  return {
    titulo,
    notas: textoOpcional(formData.get("notas")),
    cliente_id: textoOpcional(formData.get("cliente_id")),
    proyecto_id: textoOpcional(formData.get("proyecto_id")),
    duracion_min: duracion,
    ventana_desde: desde,
    ventana_hasta: hasta,
    socios_requeridos: requeridos,
    invitar_cliente: formData.get("invitar_cliente") === "on",
  }
}

export async function crearSolicitud(formData: FormData): Promise<string> {
  const datos = datosDesde(formData)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("solicitudes_reunion")
    .insert({ ...datos, created_by: await idSocioActual() })
    .select("id")
    .single()

  if (error) throw new Error(error.message)

  refrescar(data.id)
  return data.id as string
}

export async function eliminarSolicitud(id: string) {
  await eliminarEnBase({ solicitudId: id })
  refrescar(id)
}

// Las franjas llegan del editor como hora de pared ("2026-08-05", "14:00") y
// se convierten a instantes acá, del lado del servidor, donde la zona es la
// de la empresa y no la del navegador.
export async function guardarRespuesta(
  solicitudId: string,
  franjas: { fecha: string; desde: string; hasta: string }[],
  comentario?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const socioId = await idSocioActual()
  if (!socioId) return { ok: false, error: "No pude identificarte como socio" }

  const malFormadas = franjas.filter(
    (f) =>
      !FORMATO_FECHA.test(f.fecha) ||
      !FORMATO_HORA.test(f.desde) ||
      !FORMATO_HORA.test(f.hasta)
  )
  if (malFormadas.length > 0) {
    return { ok: false, error: "Hay una franja con una hora que no entiendo" }
  }

  const absolutas: FranjaGuardada[] = franjas.map((f) => ({
    inicio: new Date(instanteEnZona(f.fecha, f.desde)).toISOString(),
    fin: new Date(instanteEnZona(f.fecha, f.hasta)).toISOString(),
  }))

  const resultado = await guardarRespuestaDe({
    solicitudId,
    socioId,
    franjas: absolutas,
    comentario,
  })

  if (resultado.ok) refrescar(solicitudId)
  return resultado
}

// "No puedo en ninguno de estos días" = respuesta con cero franjas.
export async function marcarNoPuedo(
  solicitudId: string,
  comentario?: string | null
) {
  return guardarRespuesta(solicitudId, [], comentario)
}

export async function borrarRespuesta(solicitudId: string) {
  const socioId = await idSocioActual()
  if (!socioId) return { ok: false, error: "No pude identificarte como socio" }

  const supabase = await createClient()
  await supabase
    .from("reunion_respuestas")
    .delete()
    .eq("solicitud_id", solicitudId)
    .eq("socio_id", socioId)

  refrescar(solicitudId)
  return { ok: true }
}

export async function agendarReunion(solicitudId: string, inicioIso: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return { ok: false, error: "No pude identificar tu cuenta de Google" }
  }

  const resultado = await agendarSolicitud({
    solicitudId,
    inicioIso,
    organizadorEmail: user.email,
    organizadorSocioId: await idSocioActual(),
  })

  refrescar(solicitudId)
  return resultado
}

export async function cancelarReunion(
  solicitudId: string,
  motivo?: string | null
) {
  const resultado = await cancelarEnBase({ solicitudId, motivo })
  refrescar(solicitudId)
  return resultado
}

export async function reabrirSolicitud(solicitudId: string) {
  const resultado = await reabrirEnBase({ solicitudId })
  refrescar(solicitudId)
  return resultado
}

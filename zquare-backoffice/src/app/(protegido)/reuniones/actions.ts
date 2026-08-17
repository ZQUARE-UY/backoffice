"use server"

import { revalidatePath } from "next/cache"

import {
  agendarSolicitud,
  cancelarSolicitud as cancelarEnBase,
  crearSolicitudReunion,
  eliminarSolicitud as eliminarEnBase,
  guardarRespuestaDe,
  reabrirSolicitud as reabrirEnBase,
  type FranjaDePared,
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

// Solo lee el formulario; las reglas viven en crearSolicitudReunion.
function datosDesde(formData: FormData) {
  const desde = (formData.get("ventana_desde") as string | null)?.trim()
  const hasta = (formData.get("ventana_hasta") as string | null)?.trim()
  if (!desde || !hasta) throw new Error("Hay que elegir los días candidatos")

  return {
    titulo: ((formData.get("titulo") as string | null) ?? "").trim(),
    notas: textoOpcional(formData.get("notas")),
    cliente_id: textoOpcional(formData.get("cliente_id")),
    proyecto_id: textoOpcional(formData.get("proyecto_id")),
    duracion_min: Number(formData.get("duracion_min") ?? 30),
    ventana_desde: desde,
    ventana_hasta: hasta,
    socios_requeridos: formData.getAll("socios_requeridos") as string[],
    invitar_cliente: formData.get("invitar_cliente") === "on",
  }
}

export async function crearSolicitud(formData: FormData): Promise<string> {
  const resultado = await crearSolicitudReunion({
    ...datosDesde(formData),
    created_by: await idSocioActual(),
  })
  if (!resultado.ok) throw new Error(resultado.error)

  refrescar(resultado.id)
  return resultado.id
}

export async function eliminarSolicitud(id: string) {
  await eliminarEnBase({ solicitudId: id })
  refrescar(id)
}

// Las franjas llegan del editor como hora de pared ("2026-08-05", "14:00");
// la conversión a instantes y las validaciones viven en guardarRespuestaDe.
export async function guardarRespuesta(
  solicitudId: string,
  franjas: FranjaDePared[],
  comentario?: string | null,
  noPuede = false
): Promise<{ ok: boolean; error?: string }> {
  const socioId = await idSocioActual()
  if (!socioId) return { ok: false, error: "No pude identificarte como socio" }

  const resultado = await guardarRespuestaDe({
    solicitudId,
    socioId,
    franjas,
    noPuede,
    comentario,
  })

  if (resultado.ok) refrescar(solicitudId)
  return resultado
}

// "No puedo en ninguno de estos días": explícito, para que una lista vacía
// por descuido no se lea igual.
export async function marcarNoPuedo(
  solicitudId: string,
  comentario?: string | null
) {
  return guardarRespuesta(solicitudId, [], comentario, true)
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

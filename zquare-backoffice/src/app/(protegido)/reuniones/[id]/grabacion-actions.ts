"use server"

import { revalidatePath } from "next/cache"

import { iniciarSubidaResumable } from "@/lib/drive"
import { cargarSolicitud } from "@/lib/reuniones"
import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"
import {
  carpetaDeReunion,
  descartarParte as descartarEnBase,
  generarDocumentoReunion,
  registrarParteGrabacion,
  reintentarParte as reintentarEnBase,
  transcribirSiguienteParte,
  type ResultadoTranscripcion,
} from "@/lib/transcripcion"

// Server actions de la grabación/transcripción de una reunión. El audio no
// pasa por acá: el navegador lo sube directo a Drive con la sesión resumable
// (mismo esquema que subir archivos en la ficha del cliente). Acá solo se
// inician sesiones, se registran partes y se corre Whisper de a una parte.

// Inicia la subida a Drive de una parte de audio y devuelve la URL de sesión.
// Usa la cuenta de servicio (saltea RLS), así que se valida que sea un socio.
export async function iniciarSubidaAudio(
  solicitudId: string,
  nombre: string,
  mimeType: string
): Promise<{ url: string }> {
  if (!(await idSocioActual())) throw new Error("No autorizado")

  const supabase = await createClient()
  const solicitud = await cargarSolicitud(supabase, solicitudId)
  if (!solicitud) throw new Error("No encontré la reunión")

  const carpetaId = await carpetaDeReunion(supabase, solicitud)
  const url = await iniciarSubidaResumable(
    nombre.trim() || "audio-reunion.webm",
    carpetaId,
    mimeType || "audio/webm"
  )
  return { url }
}

// Registra una parte que el navegador terminó de subir a Drive.
export async function registrarParte(
  solicitudId: string,
  nombre: string,
  driveAudioId: string,
  driveAudioUrl: string | null
): Promise<{ ok: boolean; error?: string }> {
  const socioId = await idSocioActual()
  if (!socioId) return { ok: false, error: "No autorizado" }

  const supabase = await createClient()
  const resultado = await registrarParteGrabacion({
    supabase,
    solicitudId,
    nombre,
    driveAudioId,
    driveAudioUrl,
    socioId,
  })
  if (resultado.ok) revalidatePath(`/reuniones/${solicitudId}`)
  return resultado
}

// Transcribe UNA parte pendiente; el cliente repite mientras pendientes > 0.
export async function transcribirPendiente(
  solicitudId: string
): Promise<ResultadoTranscripcion> {
  if (!(await idSocioActual())) throw new Error("No autorizado")
  const supabase = await createClient()
  return transcribirSiguienteParte(supabase, solicitudId)
}

// Con todas las partes transcriptas, arma (o rearma) el Google Doc final.
export async function generarDocumento(
  solicitudId: string
): Promise<{ ok: boolean; error?: string; url?: string }> {
  if (!(await idSocioActual())) throw new Error("No autorizado")
  const supabase = await createClient()
  const resultado = await generarDocumentoReunion(supabase, solicitudId)
  if (resultado.ok) revalidatePath(`/reuniones/${solicitudId}`)
  return resultado
}

export async function reintentarParte(solicitudId: string, grabacionId: string) {
  if (!(await idSocioActual())) throw new Error("No autorizado")
  const supabase = await createClient()
  await reintentarEnBase(supabase, grabacionId)
  revalidatePath(`/reuniones/${solicitudId}`)
}

export async function descartarParte(solicitudId: string, grabacionId: string) {
  if (!(await idSocioActual())) throw new Error("No autorizado")
  const supabase = await createClient()
  await descartarEnBase(supabase, grabacionId)
  revalidatePath(`/reuniones/${solicitudId}`)
}

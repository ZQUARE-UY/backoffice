import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { etiquetaDia, etiquetaHora } from "@/lib/disponibilidad"
import { codigoReunion, type GrabacionReunion, type SolicitudReunion } from "@/lib/dominio"
import {
  asegurarCarpeta,
  descargarArchivoDrive,
  guardarDocumentoTexto,
  sharedDriveId,
} from "@/lib/drive"
import { CAMPOS_SOLICITUD } from "@/lib/reuniones"

// Transcripción de reuniones con Whisper en Cloudflare Workers AI — misma
// cuenta y mismo token que los embeddings, así que no hay credenciales
// nuevas. El audio ya está en Drive (lo subió el navegador con la sesión
// resumable); acá se baja, se manda a Whisper y el texto queda en la fila de
// la parte. Compartido entre las server actions de /reuniones/[id] y la
// herramienta MCP.

const MODELO_WHISPER = "@cf/openai/whisper-large-v3-turbo"

// Workers AI recibe el audio en base64 dentro de un JSON: más allá de ~25 MB
// el request empieza a fallar. Una parte grabada por nosotros (opus a 32
// kbps, ~15 min) pesa ~4 MB; este límite solo lo toca un archivo subido a
// mano sin comprimir.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024

export const CAMPOS_GRABACION =
  "id, solicitud_id, parte, nombre, drive_audio_id, drive_audio_url, estado, texto, error, created_by, created_at, updated_at"

async function transcribirAudio(buffer: Buffer): Promise<string> {
  const cuenta = process.env.CLOUDFLARE_ACCOUNT_ID
  const token = process.env.CLOUDFLARE_AI_TOKEN
  if (!cuenta || !token) {
    throw new Error(
      "Faltan CLOUDFLARE_ACCOUNT_ID o CLOUDFLARE_AI_TOKEN (Workers AI, Whisper)"
    )
  }
  if (buffer.byteLength > MAX_AUDIO_BYTES) {
    throw new Error(
      `El audio pesa ${Math.round(buffer.byteLength / 1024 / 1024)} MB y el máximo por parte es ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)} MB. Comprimilo (opus/mp3) o subilo en partes más cortas.`
    )
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cuenta}/ai/run/${MODELO_WHISPER}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ audio: buffer.toString("base64") }),
    }
  )
  if (!res.ok) {
    throw new Error(
      `Workers AI respondió ${res.status}: ${(await res.text()).slice(0, 300)}`
    )
  }
  const json = (await res.json()) as {
    success: boolean
    result?: { text?: string }
    errors?: { message: string }[]
  }
  if (!json.success || typeof json.result?.text !== "string") {
    throw new Error(
      `Whisper devolvió una respuesta inesperada: ${JSON.stringify(json).slice(0, 300)}`
    )
  }
  return json.result.text.trim()
}

// Carpeta de Drive donde viven el audio y la transcripción de una reunión:
// Minutas/ del cliente si la reunión tiene cliente con carpeta; si no (una
// interna), una carpeta "Reuniones" en la raíz de la unidad compartida.
export async function carpetaDeReunion(
  supabase: SupabaseClient,
  solicitud: SolicitudReunion
): Promise<string> {
  if (solicitud.cliente_id) {
    const { data } = await supabase
      .from("clientes")
      .select("drive_folder_id")
      .eq("id", solicitud.cliente_id)
      .maybeSingle()
    if (data?.drive_folder_id) {
      return asegurarCarpeta("Minutas", data.drive_folder_id)
    }
  }
  return asegurarCarpeta("Reuniones", sharedDriveId())
}

export async function listarGrabaciones(
  supabase: SupabaseClient,
  solicitudId: string
): Promise<GrabacionReunion[]> {
  const { data } = await supabase
    .from("reunion_grabaciones")
    .select(CAMPOS_GRABACION)
    .eq("solicitud_id", solicitudId)
    .order("parte")
  return (data ?? []) as GrabacionReunion[]
}

// Registra una parte ya subida a Drive. El número de parte se calcula acá
// (máximo + 1) y no en el cliente, para que dos subidas concurrentes no
// choquen contra el unique (solicitud_id, parte) más que en el peor caso.
export async function registrarParteGrabacion(opciones: {
  supabase: SupabaseClient
  solicitudId: string
  nombre: string
  driveAudioId: string
  driveAudioUrl: string | null
  socioId: string | null
}): Promise<{ ok: boolean; error?: string; parte?: number }> {
  const { supabase, solicitudId } = opciones

  const { data: ultima } = await supabase
    .from("reunion_grabaciones")
    .select("parte")
    .eq("solicitud_id", solicitudId)
    .order("parte", { ascending: false })
    .limit(1)
    .maybeSingle()
  const parte = (ultima?.parte ?? 0) + 1

  const { error } = await supabase.from("reunion_grabaciones").insert({
    solicitud_id: solicitudId,
    parte,
    nombre: opciones.nombre,
    drive_audio_id: opciones.driveAudioId,
    drive_audio_url: opciones.driveAudioUrl,
    created_by: opciones.socioId,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, parte }
}

export type ResultadoTranscripcion = {
  // Partes que quedan en estado "subida" después de esta pasada.
  pendientes: number
  // Parte procesada en esta pasada (si había alguna).
  procesada?: number
  // Error de la parte procesada; queda también en la fila.
  error?: string
}

// Transcribe UNA parte pendiente. El cliente repite mientras `pendientes > 0`
// (mismo patrón que el indexador): cada parte entra sola en el límite de
// tiempo de la función.
export async function transcribirSiguienteParte(
  supabase: SupabaseClient,
  solicitudId: string
): Promise<ResultadoTranscripcion> {
  const grabaciones = await listarGrabaciones(supabase, solicitudId)
  const pendientes = grabaciones.filter((g) => g.estado === "subida")
  const siguiente = pendientes[0]
  if (!siguiente) return { pendientes: 0 }

  try {
    const audio = await descargarArchivoDrive(siguiente.drive_audio_id)
    const texto = await transcribirAudio(audio)
    await supabase
      .from("reunion_grabaciones")
      .update({ estado: "transcripta", texto, error: null })
      .eq("id", siguiente.id)
    return { pendientes: pendientes.length - 1, procesada: siguiente.parte }
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido"
    await supabase
      .from("reunion_grabaciones")
      .update({ estado: "error", error: mensaje })
      .eq("id", siguiente.id)
    return {
      pendientes: pendientes.length - 1,
      procesada: siguiente.parte,
      error: mensaje,
    }
  }
}

// Arma (o rearma) el Google Doc con la transcripción completa y lo guarda en
// la carpeta de la reunión. Idempotente: si el doc ya existe se reemplaza su
// contenido, conservando id y URL — subir una parte más y regenerar es barato.
export async function generarDocumentoReunion(
  supabase: SupabaseClient,
  solicitudId: string
): Promise<{ ok: boolean; error?: string; url?: string }> {
  const { data } = await supabase
    .from("solicitudes_reunion")
    .select(CAMPOS_SOLICITUD)
    .eq("id", solicitudId)
    .is("deleted_at", null)
    .maybeSingle()
  const solicitud = data as unknown as SolicitudReunion | null
  if (!solicitud) return { ok: false, error: "No encontré la reunión" }

  const grabaciones = await listarGrabaciones(supabase, solicitudId)
  const transcriptas = grabaciones.filter((g) => g.estado === "transcripta")
  if (transcriptas.length === 0) {
    return { ok: false, error: "Todavía no hay ninguna parte transcripta" }
  }
  if (grabaciones.some((g) => g.estado === "subida")) {
    return { ok: false, error: "Hay partes sin transcribir todavía" }
  }

  const codigo = codigoReunion(solicitud.numero)
  const encabezado = [
    `${codigo} — ${solicitud.titulo}`,
    solicitud.inicio
      ? `Reunión del ${etiquetaDia(Date.parse(solicitud.inicio))} a las ${etiquetaHora(Date.parse(solicitud.inicio))}`
      : null,
    solicitud.notas ? `Notas de la convocatoria: ${solicitud.notas}` : null,
    "Transcripción automática (Whisper) — puede tener errores de oído.",
  ]
    .filter(Boolean)
    .join("\n")

  const fallidas = grabaciones.filter((g) => g.estado === "error")
  const cuerpo = transcriptas
    .map((g) =>
      transcriptas.length > 1 ? `— Parte ${g.parte} —\n\n${g.texto}` : g.texto
    )
    .join("\n\n")
  const avisoFallidas =
    fallidas.length > 0
      ? `\n\n[Faltan ${fallidas.length} parte(s) que no se pudieron transcribir: ${fallidas.map((g) => g.parte).join(", ")}]`
      : ""

  try {
    const carpetaId = await carpetaDeReunion(supabase, solicitud)
    const doc = await guardarDocumentoTexto(
      `${codigo} — Transcripción — ${solicitud.titulo}`,
      carpetaId,
      `${encabezado}\n\n${cuerpo}${avisoFallidas}\n`,
      solicitud.drive_transcripcion_id
    )
    await supabase
      .from("solicitudes_reunion")
      .update({
        drive_transcripcion_id: doc.id,
        drive_transcripcion_url: doc.url,
      })
      .eq("id", solicitudId)
    return { ok: true, url: doc.url }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "No se pudo guardar en Drive",
    }
  }
}

// Vuelve una parte fallida a la cola de transcripción.
export async function reintentarParte(
  supabase: SupabaseClient,
  grabacionId: string
): Promise<void> {
  await supabase
    .from("reunion_grabaciones")
    .update({ estado: "subida", error: null })
    .eq("id", grabacionId)
    .eq("estado", "error")
}

// Descarta una parte (el audio queda en Drive; solo sale de la transcripción).
export async function descartarParte(
  supabase: SupabaseClient,
  grabacionId: string
): Promise<void> {
  await supabase.from("reunion_grabaciones").delete().eq("id", grabacionId)
}

import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  consultarBusy,
  crearEventoReunion,
  eliminarEventoReunion,
} from "@/lib/calendario"
import {
  calcularHuecos,
  instanteEnZona,
  normalizar,
  paredEnZona,
  partirPorDia,
  sumarDias,
  type Intervalo,
} from "@/lib/disponibilidad"
import type {
  EstadoRespuesta,
  FranjaGuardada,
  RespuestaReunion,
  Socio,
  SolicitudReunion,
} from "@/lib/dominio"
import { googleConfigurado } from "@/lib/google"
import { createClient } from "@/lib/supabase/server"

// Reglas de negocio de las reuniones, compartidas entre las server actions de
// /reuniones y las herramientas MCP. Ambas entran por acá para que no haya dos
// versiones de "cómo se agenda".
//
// El cliente de Supabase se puede inyectar: las server actions usan el de
// sesión (con RLS) y el MCP el de service role.

type Cliente = SupabaseClient

async function clientePorDefecto(supabase?: Cliente): Promise<Cliente> {
  return supabase ?? ((await createClient()) as unknown as Cliente)
}

// No proponer huecos encima de la hora: nadie llega a una reunión avisada con
// diez minutos.
const ANTELACION_MIN = 120

// El día de hoy en Montevideo, para prellenar la ventana de días. Vive en una
// función async porque leer el reloj durante el render de un componente es
// impuro (y el linter de React lo marca).
export async function fechaDeHoy(): Promise<string> {
  return paredEnZona(Date.now()).fecha
}

export const CAMPOS_SOLICITUD =
  "id, numero, titulo, notas, cliente_id, proyecto_id, duracion_min, ventana_desde, ventana_hasta, socios_requeridos, invitar_cliente, estado, inicio, fin, google_event_id, google_calendar_id, meet_url, agendada_por, agendada_at, metadata, created_by, created_at, updated_at"

// La ventana son días de calendario: arranca a las 00:00 del primero y
// termina a las 00:00 del día siguiente al último.
export function ventanaComoIntervalo(solicitud: {
  ventana_desde: string
  ventana_hasta: string
}): Intervalo {
  return {
    inicio: instanteEnZona(solicitud.ventana_desde, "00:00"),
    fin: instanteEnZona(sumarDias(solicitud.ventana_hasta, 1), "00:00"),
  }
}

function aIntervalos(franjas: FranjaGuardada[]): Intervalo[] {
  return franjas.map((f) => ({
    inicio: Date.parse(f.inicio),
    fin: Date.parse(f.fin),
  }))
}

export function estadoDeRespuesta(
  respuesta: RespuestaReunion | undefined
): EstadoRespuesta {
  if (!respuesta) return "falta"
  return respuesta.franjas.length > 0 ? "respondio" : "no_puede"
}

export type ResumenHuecos = {
  solicitud: SolicitudReunion
  huecos: Intervalo[]
  socios: { socio: Socio; estado: EstadoRespuesta }[]
  respondieron: number
  requeridos: number
  // Todavía falta responder alguien: los huecos pueden achicarse.
  parcial: boolean
  sinAcceso: string[]
}

export async function huecosDeSolicitud(
  solicitudId: string,
  opciones: { supabase?: Cliente } = {}
): Promise<ResumenHuecos | null> {
  const supabase = await clientePorDefecto(opciones.supabase)

  const { data: solicitud } = await supabase
    .from("solicitudes_reunion")
    .select(CAMPOS_SOLICITUD)
    .eq("id", solicitudId)
    .is("deleted_at", null)
    .maybeSingle<SolicitudReunion>()

  if (!solicitud) return null

  const [{ data: respuestas }, { data: socios }] = await Promise.all([
    supabase
      .from("reunion_respuestas")
      .select("id, solicitud_id, socio_id, franjas, comentario, created_at, updated_at")
      .eq("solicitud_id", solicitudId),
    supabase
      .from("socios")
      .select("id, nombre, email")
      .in("id", solicitud.socios_requeridos),
  ])

  const porSocio = new Map<string, RespuestaReunion>(
    ((respuestas ?? []) as RespuestaReunion[]).map((r) => [r.socio_id, r])
  )

  // Respeta el orden en que se eligieron los socios requeridos.
  const requeridos = solicitud.socios_requeridos
    .map((id) => ((socios ?? []) as Socio[]).find((s) => s.id === id))
    .filter((s): s is Socio => Boolean(s))

  const detalle = requeridos.map((socio) => ({
    socio,
    estado: estadoDeRespuesta(porSocio.get(socio.id)),
  }))

  const respondieron = detalle.filter((d) => d.estado !== "falta").length
  const ventana = ventanaComoIntervalo(solicitud)

  // Quien todavía no respondió no restringe nada: ni con franjas ni con su
  // agenda. Si no, un socio que ni abrió la encuesta borraría huecos y la UI
  // no tendría cómo explicarlo.
  const respondieronSocios = requeridos.filter((s) => porSocio.has(s.id))

  // Los calendarios se consultan solo por la ventana pedida, y solo mientras
  // la encuesta siga abierta: para una reunión ya agendada los huecos no se
  // muestran y la llamada sería al pedo.
  const { busy, sinAcceso } =
    googleConfigurado() && solicitud.estado === "abierta"
      ? await consultarBusy(
          respondieronSocios.map((s) => s.email),
          new Date(ventana.inicio),
          new Date(ventana.fin)
        )
      : { busy: [], sinAcceso: [] }

  const franjasPorSocio = respondieronSocios
    .map((socio) => porSocio.get(socio.id))
    .filter((r): r is RespuestaReunion => Boolean(r))
    .map((r) => aIntervalos(r.franjas))

  const huecos = calcularHuecos({
    franjasPorSocio,
    busy,
    ventana,
    duracionMin: solicitud.duracion_min,
    desde: Date.now() + ANTELACION_MIN * 60_000,
  })

  return {
    solicitud,
    huecos,
    socios: detalle,
    respondieron,
    requeridos: requeridos.length,
    parcial: respondieron < requeridos.length,
    sinAcceso,
  }
}

// Solicitudes abiertas donde el socio es requerido y todavía no respondió:
// alimenta el badge del sidebar y el bloque del dashboard.
export async function solicitudesPendientes(
  socioId: string,
  opciones: { supabase?: Cliente } = {}
): Promise<SolicitudReunion[]> {
  const supabase = await clientePorDefecto(opciones.supabase)

  const { data: solicitudes } = await supabase
    .from("solicitudes_reunion")
    .select(CAMPOS_SOLICITUD)
    .eq("estado", "abierta")
    .is("deleted_at", null)
    .contains("socios_requeridos", [socioId])
    .order("ventana_desde", { ascending: true })

  const abiertas = (solicitudes ?? []) as SolicitudReunion[]
  if (abiertas.length === 0) return []

  const { data: respuestas } = await supabase
    .from("reunion_respuestas")
    .select("solicitud_id")
    .eq("socio_id", socioId)
    .in(
      "solicitud_id",
      abiertas.map((s) => s.id)
    )

  const respondidas = new Set(
    (respuestas ?? []).map((r) => (r as { solicitud_id: string }).solicitud_id)
  )
  return abiertas.filter((s) => !respondidas.has(s.id))
}

export async function contarPendientes(
  socioId: string,
  opciones: { supabase?: Cliente } = {}
): Promise<number> {
  const pendientes = await solicitudesPendientes(socioId, opciones)
  return pendientes.length
}

export type ResultadoAgenda = {
  ok: boolean
  error?: string
  advertencia?: string
  meetUrl?: string | null
  inicio?: string
}

// Agenda un hueco. El orden importa:
//   1. revalidar que el hueco siga libre,
//   2. tomar la solicitud en la base con un update condicional (si dos socios
//      agendan a la vez, el segundo pierde acá y nunca llega a crear evento),
//   3. recién entonces crear el evento en Google.
// Si Google falla, la reunión igual queda agendada con el error en metadata:
// se pierde el evento, no el acuerdo al que llegaron los socios.
export async function agendarSolicitud(params: {
  solicitudId: string
  inicioIso: string
  organizadorEmail: string
  organizadorSocioId: string | null
  supabase?: Cliente
}): Promise<ResultadoAgenda> {
  const {
    solicitudId,
    inicioIso,
    organizadorEmail,
    organizadorSocioId,
  } = params
  const supabase = await clientePorDefecto(params.supabase)

  const resumen = await huecosDeSolicitud(solicitudId, { supabase })
  if (!resumen) return { ok: false, error: "No encontré esa reunión" }
  if (resumen.solicitud.estado !== "abierta") {
    return {
      ok: false,
      error:
        resumen.solicitud.estado === "agendada"
          ? "Esa reunión ya está agendada"
          : "Esa reunión está cancelada",
    }
  }

  const inicioMs = Date.parse(inicioIso)
  const hueco = resumen.huecos.find((h) => h.inicio === inicioMs)
  if (!hueco) {
    return {
      ok: false,
      error:
        "Ese horario ya no está disponible. Actualizá la página para ver los huecos al día.",
    }
  }

  const { data: tomada } = await supabase
    .from("solicitudes_reunion")
    .update({
      estado: "agendada",
      inicio: new Date(hueco.inicio).toISOString(),
      fin: new Date(hueco.fin).toISOString(),
      agendada_por: organizadorSocioId,
      agendada_at: new Date().toISOString(),
    })
    .eq("id", solicitudId)
    .eq("estado", "abierta")
    .select("id")

  if (!tomada || tomada.length === 0) {
    return { ok: false, error: "Otro socio agendó esta reunión recién" }
  }

  const invitados = resumen.socios.map((s) => s.socio.email)
  let emailCliente: string | null = null
  if (resumen.solicitud.invitar_cliente && resumen.solicitud.cliente_id) {
    const { data: cliente } = await supabase
      .from("clientes")
      .select("email")
      .eq("id", resumen.solicitud.cliente_id)
      .maybeSingle()
    emailCliente = (cliente as { email: string | null } | null)?.email ?? null
    if (emailCliente) invitados.push(emailCliente)
  }

  const inicio = new Date(hueco.inicio).toISOString()

  try {
    if (!googleConfigurado()) {
      throw new Error("Google Calendar no está configurado en este entorno")
    }
    const evento = await crearEventoReunion({
      organizador: organizadorEmail,
      titulo: resumen.solicitud.titulo,
      descripcion: resumen.solicitud.notas,
      inicio: new Date(hueco.inicio),
      fin: new Date(hueco.fin),
      invitados,
    })

    // Limpia un error_calendario de un intento anterior que sí falló.
    const metadata = { ...(resumen.solicitud.metadata ?? {}) }
    delete (metadata as { error_calendario?: string }).error_calendario

    await supabase
      .from("solicitudes_reunion")
      .update({
        google_event_id: evento.eventId,
        google_calendar_id: evento.calendarId,
        meet_url: evento.meetUrl,
        metadata,
      })
      .eq("id", solicitudId)

    return { ok: true, meetUrl: evento.meetUrl, inicio }
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error)
    await supabase
      .from("solicitudes_reunion")
      .update({
        metadata: {
          ...(resumen.solicitud.metadata ?? {}),
          error_calendario: detalle,
        },
      })
      .eq("id", solicitudId)

    return {
      ok: true,
      inicio,
      advertencia:
        "La reunión quedó agendada, pero no se pudo crear el evento en Google Calendar. Hay que invitar a mano.",
    }
  }
}

// Cancelar o reabrir borran el evento si existe, pero nunca se traban por eso:
// el estado en el backoffice manda.
async function borrarEventoSiHay(solicitud: SolicitudReunion): Promise<void> {
  if (!solicitud.google_event_id || !solicitud.google_calendar_id) return
  try {
    await eliminarEventoReunion(
      solicitud.google_calendar_id,
      solicitud.google_event_id
    )
  } catch {
    // Ya se avisa en la UI que puede haber quedado el evento colgado.
  }
}

export async function cancelarSolicitud(params: {
  solicitudId: string
  motivo?: string | null
  supabase?: Cliente
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await clientePorDefecto(params.supabase)

  const { data: solicitud } = await supabase
    .from("solicitudes_reunion")
    .select(CAMPOS_SOLICITUD)
    .eq("id", params.solicitudId)
    .is("deleted_at", null)
    .maybeSingle<SolicitudReunion>()

  if (!solicitud) return { ok: false, error: "No encontré esa reunión" }

  await borrarEventoSiHay(solicitud)

  await supabase
    .from("solicitudes_reunion")
    .update({
      estado: "cancelada",
      metadata: params.motivo
        ? { ...(solicitud.metadata ?? {}), motivo_cancelacion: params.motivo }
        : solicitud.metadata,
    })
    .eq("id", params.solicitudId)

  return { ok: true }
}

// Volver a abrir una reunión ya agendada: se borra el evento y se limpian los
// datos del agendado para que el cálculo de huecos vuelva a correr limpio.
export async function reabrirSolicitud(params: {
  solicitudId: string
  supabase?: Cliente
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await clientePorDefecto(params.supabase)

  const { data: solicitud } = await supabase
    .from("solicitudes_reunion")
    .select(CAMPOS_SOLICITUD)
    .eq("id", params.solicitudId)
    .is("deleted_at", null)
    .maybeSingle<SolicitudReunion>()

  if (!solicitud) return { ok: false, error: "No encontré esa reunión" }

  await borrarEventoSiHay(solicitud)

  // Se limpia todo rastro del intento anterior para que la encuesta vuelva a
  // arrancar de cero.
  const metadata = { ...(solicitud.metadata ?? {}) } as Record<string, unknown>
  delete metadata.error_calendario
  delete metadata.motivo_cancelacion

  await supabase
    .from("solicitudes_reunion")
    .update({
      estado: "abierta",
      inicio: null,
      fin: null,
      google_event_id: null,
      google_calendar_id: null,
      meet_url: null,
      agendada_por: null,
      agendada_at: null,
      metadata,
    })
    .eq("id", params.solicitudId)

  return { ok: true }
}

// Baja definitiva: borra el evento de Google (si llegó a crearse), las
// respuestas de los socios y la solicitud. El soft delete no dispara el
// cascade, así que las respuestas se borran a mano.
export async function eliminarSolicitud(params: {
  solicitudId: string
  supabase?: Cliente
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await clientePorDefecto(params.supabase)

  const { data: solicitud } = await supabase
    .from("solicitudes_reunion")
    .select(CAMPOS_SOLICITUD)
    .eq("id", params.solicitudId)
    .is("deleted_at", null)
    .maybeSingle<SolicitudReunion>()

  if (!solicitud) return { ok: false, error: "No encontré esa reunión" }

  await borrarEventoSiHay(solicitud)

  await supabase
    .from("reunion_respuestas")
    .delete()
    .eq("solicitud_id", params.solicitudId)

  await supabase
    .from("solicitudes_reunion")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", params.solicitudId)

  return { ok: true }
}

// Guarda la respuesta de un socio como reemplazo completo de sus franjas.
// Un array vacío es "no puedo en ninguno de estos días", que es distinto de
// no haber respondido (ahí directamente no hay fila).
export async function guardarRespuestaDe(params: {
  solicitudId: string
  socioId: string
  franjas: FranjaGuardada[]
  comentario?: string | null
  supabase?: Cliente
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await clientePorDefecto(params.supabase)

  const { data: solicitud } = await supabase
    .from("solicitudes_reunion")
    .select(CAMPOS_SOLICITUD)
    .eq("id", params.solicitudId)
    .is("deleted_at", null)
    .maybeSingle<SolicitudReunion>()

  if (!solicitud) return { ok: false, error: "No encontré esa reunión" }
  if (solicitud.estado !== "abierta") {
    return { ok: false, error: "Esa reunión ya no está abierta" }
  }
  if (!solicitud.socios_requeridos.includes(params.socioId)) {
    return { ok: false, error: "No estás entre los socios requeridos" }
  }

  const ventana = ventanaComoIntervalo(solicitud)
  const franjas = params.franjas.map((f) => ({
    inicio: Date.parse(f.inicio),
    fin: Date.parse(f.fin),
  }))

  if (franjas.some((f) => !Number.isFinite(f.inicio) || !Number.isFinite(f.fin))) {
    return { ok: false, error: "Hay una franja con una fecha que no entiendo" }
  }
  if (franjas.some((f) => f.fin <= f.inicio)) {
    return { ok: false, error: "Hay una franja que termina antes de empezar" }
  }
  if (franjas.some((f) => f.inicio < ventana.inicio || f.fin > ventana.fin)) {
    return { ok: false, error: "Hay una franja fuera de los días propuestos" }
  }

  // Normalizar evita guardar rangos superpuestos que el socio cargó por
  // separado; partir por día mantiene la forma que el editor sabe releer.
  const guardar = partirPorDia(normalizar(franjas)).map((f) => ({
    inicio: new Date(f.inicio).toISOString(),
    fin: new Date(f.fin).toISOString(),
  }))

  const { error } = await supabase.from("reunion_respuestas").upsert(
    {
      solicitud_id: params.solicitudId,
      socio_id: params.socioId,
      franjas: guardar,
      comentario: params.comentario ?? null,
    },
    { onConflict: "solicitud_id,socio_id" }
  )

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

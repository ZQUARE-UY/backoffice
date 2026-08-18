import "server-only"

import { cache } from "react"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  consultarBusy,
  crearEventoReunion,
  eliminarEventoReunion,
} from "@/lib/calendario"
import {
  calcularHuecos,
  diasDeVentana,
  FORMATO_FECHA,
  FORMATO_HORA,
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
  "id, numero, titulo, notas, cliente_id, proyecto_id, duracion_min, ventana_desde, ventana_hasta, socios_requeridos, invitar_cliente, invitados_externos, estado, inicio, fin, google_event_id, google_calendar_id, meet_url, agendada_por, agendada_at, metadata, created_by, created_at, updated_at"

// Ventana máxima de días candidatos; la migración lo refuerza con un check.
export const MAX_DIAS_VENTANA = 60

// Una solicitud viva (no borrada) por id. Único lugar donde se decide qué
// columnas y qué regla de baja aplican.
export async function cargarSolicitud(
  supabase: Cliente,
  solicitudId: string
): Promise<SolicitudReunion | null> {
  const { data } = await supabase
    .from("solicitudes_reunion")
    .select(CAMPOS_SOLICITUD)
    .eq("id", solicitudId)
    .is("deleted_at", null)
    .maybeSingle<SolicitudReunion>()
  return data ?? null
}

export type DatosSolicitud = {
  titulo: string
  notas?: string | null
  cliente_id?: string | null
  proyecto_id?: string | null
  duracion_min: number
  ventana_desde: string
  ventana_hasta: string
  socios_requeridos: string[]
  invitar_cliente: boolean
  invitados_externos: string[]
  created_by: string | null
}

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// "a@x.com, b@y.com" → ["a@x.com","b@y.com"], en minúsculas y sin repetir.
export function parsearEmails(texto: string | null | undefined): string[] {
  return Array.from(
    new Set(
      (texto ?? "")
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    )
  )
}

// Alta de una solicitud. Las server actions y el MCP entran por acá: las
// reglas (ventana, socios, duración) viven una sola vez y los mensajes salen
// en castellano en vez del texto crudo del check de Postgres.
// Reglas de una solicitud, iguales al crear y al editar. Devuelve el error
// en castellano o null.
function validarDatosSolicitud(datos: DatosSolicitud): string | null {
  if (datos.titulo.trim().length < 3) return "El título es obligatorio"
  if (
    !FORMATO_FECHA.test(datos.ventana_desde) ||
    !FORMATO_FECHA.test(datos.ventana_hasta)
  ) {
    return "Las fechas van en formato YYYY-MM-DD"
  }
  if (datos.ventana_hasta < datos.ventana_desde) {
    return "El último día no puede ser anterior al primero"
  }
  if (
    diasDeVentana(datos.ventana_desde, datos.ventana_hasta).length >
    MAX_DIAS_VENTANA
  ) {
    return `La ventana de días no puede superar los ${MAX_DIAS_VENTANA} días`
  }
  if (datos.socios_requeridos.length === 0) {
    return "Elegí al menos un socio para la reunión"
  }
  if (datos.duracion_min !== 30 && datos.duracion_min !== 60) {
    return "La duración tiene que ser de 30 o 60 minutos"
  }
  const malos = datos.invitados_externos.filter((e) => !FORMATO_EMAIL.test(e))
  if (malos.length > 0) {
    return `Hay un mail que no entiendo: ${malos.join(", ")}`
  }
  return null
}

function filaDe(datos: DatosSolicitud) {
  return {
    titulo: datos.titulo.trim(),
    notas: datos.notas ?? null,
    cliente_id: datos.cliente_id ?? null,
    proyecto_id: datos.proyecto_id ?? null,
    duracion_min: datos.duracion_min,
    ventana_desde: datos.ventana_desde,
    ventana_hasta: datos.ventana_hasta,
    socios_requeridos: datos.socios_requeridos,
    invitar_cliente: datos.invitar_cliente,
    invitados_externos: datos.invitados_externos,
  }
}

export async function crearSolicitudReunion(
  datos: DatosSolicitud,
  opciones: { supabase?: Cliente } = {}
): Promise<
  | { ok: true; id: string; numero: number }
  | { ok: false; error: string }
> {
  const invalido = validarDatosSolicitud(datos)
  if (invalido) return { ok: false, error: invalido }

  const supabase = await clientePorDefecto(opciones.supabase)
  const { data, error } = await supabase
    .from("solicitudes_reunion")
    .insert({ ...filaDe(datos), created_by: datos.created_by })
    .select("id, numero")
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo crear" }
  }
  return { ok: true, id: data.id as string, numero: data.numero as number }
}

// Edita una solicitud abierta. Las respuestas ya cargadas se conservan; si la
// ventana se achica, las franjas que quedan afuera se recortan para que
// sigan siendo válidas (y el socio no tenga que volver a responder).
export async function editarSolicitudReunion(params: {
  solicitudId: string
  datos: Omit<DatosSolicitud, "created_by">
  supabase?: Cliente
  solicitud?: SolicitudReunion
}): Promise<{ ok: boolean; error?: string; advertencia?: string }> {
  const supabase = await clientePorDefecto(params.supabase)
  const solicitud =
    params.solicitud ?? (await cargarSolicitud(supabase, params.solicitudId))
  if (!solicitud) return { ok: false, error: "No encontré esa reunión" }
  if (solicitud.estado !== "abierta") {
    return {
      ok: false,
      error: "Solo se puede editar una reunión que sigue abierta",
    }
  }

  const datos: DatosSolicitud = { ...params.datos, created_by: solicitud.created_by }
  const invalido = validarDatosSolicitud(datos)
  if (invalido) return { ok: false, error: invalido }

  const { error } = await supabase
    .from("solicitudes_reunion")
    .update(filaDe(datos))
    .eq("id", params.solicitudId)
    .eq("estado", "abierta")
  if (error) return { ok: false, error: error.message }

  // Recorte de franjas fuera de la ventana nueva.
  const seAchico =
    datos.ventana_desde > solicitud.ventana_desde ||
    datos.ventana_hasta < solicitud.ventana_hasta
  if (!seAchico) return { ok: true }

  const ventana = ventanaComoIntervalo(datos)
  const { data: respuestas } = await supabase
    .from("reunion_respuestas")
    .select("id, franjas")
    .eq("solicitud_id", params.solicitudId)

  let recortadas = 0
  for (const r of (respuestas ?? []) as { id: string; franjas: FranjaGuardada[] }[]) {
    if (r.franjas.length === 0) continue
    const dentro = r.franjas
      .map((f) => ({ inicio: Date.parse(f.inicio), fin: Date.parse(f.fin) }))
      .map((f) => ({
        inicio: Math.max(f.inicio, ventana.inicio),
        fin: Math.min(f.fin, ventana.fin),
      }))
      .filter((f) => f.fin > f.inicio)
      .map((f) => ({
        inicio: new Date(f.inicio).toISOString(),
        fin: new Date(f.fin).toISOString(),
      }))
    if (dentro.length === r.franjas.length) continue
    recortadas++
    // Si no le queda nada dentro, mejor que vuelva a responder a que figure
    // como "no puede": se borra la fila.
    if (dentro.length === 0) {
      await supabase.from("reunion_respuestas").delete().eq("id", r.id)
    } else {
      await supabase
        .from("reunion_respuestas")
        .update({ franjas: dentro })
        .eq("id", r.id)
    }
  }

  return {
    ok: true,
    advertencia:
      recortadas > 0
        ? "Se achicó la ventana: las franjas que quedaron afuera se descartaron."
        : undefined,
  }
}

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

// Si quien llama ya tiene la solicitud cargada (el MCP la resuelve por
// código), la pasa en `solicitud` y se ahorra el viaje.
export async function huecosDeSolicitud(
  solicitudId: string,
  opciones: { supabase?: Cliente; solicitud?: SolicitudReunion } = {}
): Promise<ResumenHuecos | null> {
  const supabase = await clientePorDefecto(opciones.supabase)

  const solicitud =
    opciones.solicitud ?? (await cargarSolicitud(supabase, solicitudId))

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
// alimenta el badge del sidebar y el bloque del dashboard. Va con `cache`
// porque el layout y el dashboard la piden en el mismo request; con el
// cliente de sesión (sin `opciones`) comparten una sola consulta.
export const solicitudesPendientes = cache(async function solicitudesPendientes(
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
})

// Todas las reuniones abiertas ("a coordinar"), con quiénes ya respondieron:
// alimenta la tarjeta del dashboard, que las muestra a todos los socios y no
// solo a quien le falta responder.
export type SolicitudACoordinar = {
  solicitud: SolicitudReunion
  respondieron: number
  requeridos: number
  faltan: string[]
  meFalta: boolean
}

export const solicitudesACoordinar = cache(async function solicitudesACoordinar(
  socioId: string | null
): Promise<SolicitudACoordinar[]> {
  const supabase = await clientePorDefecto()

  const { data: solicitudes } = await supabase
    .from("solicitudes_reunion")
    .select(CAMPOS_SOLICITUD)
    .eq("estado", "abierta")
    .is("deleted_at", null)
    .order("ventana_desde", { ascending: true })

  const abiertas = (solicitudes ?? []) as SolicitudReunion[]
  if (abiertas.length === 0) return []

  const [{ data: respuestas }, { data: socios }] = await Promise.all([
    supabase
      .from("reunion_respuestas")
      .select("solicitud_id, socio_id")
      .in(
        "solicitud_id",
        abiertas.map((s) => s.id)
      ),
    supabase.from("socios").select("id, nombre").is("deleted_at", null),
  ])

  const nombre = new Map(
    ((socios ?? []) as { id: string; nombre: string }[]).map((s) => [s.id, s.nombre])
  )
  const respondidoPor = new Map<string, Set<string>>()
  for (const r of (respuestas ?? []) as { solicitud_id: string; socio_id: string }[]) {
    ;(respondidoPor.get(r.solicitud_id) ??
      respondidoPor.set(r.solicitud_id, new Set()).get(r.solicitud_id))!.add(r.socio_id)
  }

  return abiertas.map((solicitud) => {
    const ya = respondidoPor.get(solicitud.id) ?? new Set<string>()
    const faltanIds = solicitud.socios_requeridos.filter((id) => !ya.has(id))
    return {
      solicitud,
      respondieron: solicitud.socios_requeridos.length - faltanIds.length,
      requeridos: solicitud.socios_requeridos.length,
      faltan: faltanIds.map((id) => nombre.get(id) ?? "?"),
      meFalta: Boolean(socioId && faltanIds.includes(socioId)),
    }
  })
})

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
  solicitud?: SolicitudReunion
}): Promise<ResultadoAgenda> {
  const {
    solicitudId,
    inicioIso,
    organizadorEmail,
    organizadorSocioId,
  } = params
  const supabase = await clientePorDefecto(params.supabase)

  const resumen = await huecosDeSolicitud(solicitudId, {
    supabase,
    solicitud: params.solicitud,
  })
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
  for (const email of resumen.solicitud.invitados_externos ?? []) {
    if (!invitados.includes(email)) invitados.push(email)
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

    const { error: errorGuardado } = await supabase
      .from("solicitudes_reunion")
      .update({
        google_event_id: evento.eventId,
        google_calendar_id: evento.calendarId,
        meet_url: evento.meetUrl,
        metadata,
      })
      .eq("id", solicitudId)

    // El evento ya existe en Google; si no pudimos guardar su id, avisar,
    // porque cancelar/reabrir no van a poder borrarlo solos.
    if (errorGuardado) {
      return {
        ok: true,
        meetUrl: evento.meetUrl,
        inicio,
        advertencia: `El evento se creó en Google Calendar (${evento.meetUrl ?? "sin link de Meet"}) pero no se pudo guardar su referencia en el backoffice: si se cancela, habrá que borrarlo a mano.`,
      }
    }

    return { ok: true, meetUrl: evento.meetUrl, inicio }
  } catch (error) {
    const crudo = error instanceof Error ? error.message : String(error)
    // unauthorized_client es siempre lo mismo: falta la delegación de dominio
    // para la cuenta de servicio (o los scopes autorizados no coinciden).
    const detalle = crudo.includes("unauthorized_client")
      ? `Falta habilitar la delegación de dominio para la cuenta de servicio en admin.google.com (ver README). Google dijo: ${crudo}`
      : crudo
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

export type ResultadoCambio = {
  ok: boolean
  error?: string
  // El cambio se hizo, pero quedó algo para resolver a mano (p. ej. el evento
  // de Google no se pudo borrar).
  advertencia?: string
}

const AVISO_EVENTO_COLGADO =
  "No se pudo borrar el evento de Google Calendar: hay que sacarlo a mano para que los invitados no lo sigan viendo."

// Cuando el último socio requerido responde, la reunión se agenda sola en el
// primer hueco en común: no hace falta que nadie vuelva a entrar a elegir.
// Quien respondió último queda como organizador del evento. Si no hay hueco
// (alguien no puede, o los calendarios no dejan lugar) queda abierta y la
// página lo muestra.
export async function agendarSiTodosRespondieron(params: {
  solicitudId: string
  organizadorEmail: string | null
  organizadorSocioId: string | null
  supabase?: Cliente
}): Promise<{
  agendada: boolean
  inicio?: string
  duracionMin?: number
  advertencia?: string
}> {
  const supabase = await clientePorDefecto(params.supabase)
  const resumen = await huecosDeSolicitud(params.solicitudId, { supabase })
  if (!resumen || resumen.solicitud.estado !== "abierta") return { agendada: false }
  if (resumen.parcial || resumen.huecos.length === 0) return { agendada: false }
  if (!params.organizadorEmail) return { agendada: false }

  const primero = resumen.huecos[0]
  const resultado = await agendarSolicitud({
    solicitudId: params.solicitudId,
    inicioIso: new Date(primero.inicio).toISOString(),
    organizadorEmail: params.organizadorEmail,
    organizadorSocioId: params.organizadorSocioId,
    supabase,
    solicitud: resumen.solicitud,
  })
  if (!resultado.ok) return { agendada: false }
  return {
    agendada: true,
    inicio: resultado.inicio,
    duracionMin: resumen.solicitud.duracion_min,
    advertencia: resultado.advertencia,
  }
}

// Cancelar o reabrir borran el evento si existe, pero nunca se traban por eso:
// el estado en el backoffice manda. Si el borrado falla, devuelven el aviso
// para que UI y MCP no digan "evento borrado" cuando no lo está.
async function borrarEventoSiHay(
  solicitud: SolicitudReunion
): Promise<string | undefined> {
  if (!solicitud.google_event_id || !solicitud.google_calendar_id) return
  try {
    await eliminarEventoReunion(
      solicitud.google_calendar_id,
      solicitud.google_event_id
    )
    return undefined
  } catch {
    return AVISO_EVENTO_COLGADO
  }
}

export async function cancelarSolicitud(params: {
  solicitudId: string
  motivo?: string | null
  supabase?: Cliente
  solicitud?: SolicitudReunion
}): Promise<ResultadoCambio> {
  const supabase = await clientePorDefecto(params.supabase)

  const solicitud =
    params.solicitud ?? (await cargarSolicitud(supabase, params.solicitudId))
  if (!solicitud) return { ok: false, error: "No encontré esa reunión" }

  const advertencia = await borrarEventoSiHay(solicitud)

  await supabase
    .from("solicitudes_reunion")
    .update({
      estado: "cancelada",
      metadata: params.motivo
        ? { ...(solicitud.metadata ?? {}), motivo_cancelacion: params.motivo }
        : solicitud.metadata,
    })
    .eq("id", params.solicitudId)

  return { ok: true, advertencia }
}

// Volver a abrir una reunión ya agendada o cancelada: se borra el evento y se
// limpian los datos del agendado para elegir otro horario. Las respuestas de
// los socios se conservan: la ventana y la duración no cambiaron, y cada uno
// puede editar la suya si se liberó.
export async function reabrirSolicitud(params: {
  solicitudId: string
  supabase?: Cliente
  solicitud?: SolicitudReunion
}): Promise<ResultadoCambio> {
  const supabase = await clientePorDefecto(params.supabase)

  const solicitud =
    params.solicitud ?? (await cargarSolicitud(supabase, params.solicitudId))
  if (!solicitud) return { ok: false, error: "No encontré esa reunión" }

  const advertencia = await borrarEventoSiHay(solicitud)

  // Se limpia el rastro del intento de agendado anterior.
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

  return { ok: true, advertencia }
}

// Baja definitiva: borra el evento de Google (si llegó a crearse), las
// respuestas de los socios y la solicitud. El soft delete no dispara el
// cascade, así que las respuestas se borran a mano.
export async function eliminarSolicitud(params: {
  solicitudId: string
  supabase?: Cliente
}): Promise<ResultadoCambio> {
  const supabase = await clientePorDefecto(params.supabase)

  const solicitud = await cargarSolicitud(supabase, params.solicitudId)
  if (!solicitud) return { ok: false, error: "No encontré esa reunión" }

  const advertencia = await borrarEventoSiHay(solicitud)

  await supabase
    .from("reunion_respuestas")
    .delete()
    .eq("solicitud_id", params.solicitudId)

  await supabase
    .from("solicitudes_reunion")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", params.solicitudId)

  return { ok: true, advertencia }
}

// Una franja como la escribe el socio: día y horas de pared en la zona de la
// empresa. La conversión a instantes se hace acá, del lado del servidor, y una
// sola vez para el editor web y para el MCP.
export type FranjaDePared = { fecha: string; desde: string; hasta: string }

// Guarda la respuesta de un socio como reemplazo completo de sus franjas.
// "No puedo en ninguno de estos días" es explícito (`noPuede`), y se guarda
// como cero franjas, que es distinto de no haber respondido (ahí directamente
// no hay fila). Una lista vacía sin `noPuede` se rechaza: si no, olvidarse las
// franjas se leería como "no puede" y borraría los huecos de todos.
export async function guardarRespuestaDe(params: {
  solicitudId: string
  socioId: string
  franjas: FranjaDePared[]
  noPuede?: boolean
  comentario?: string | null
  supabase?: Cliente
  solicitud?: SolicitudReunion
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await clientePorDefecto(params.supabase)

  const solicitud =
    params.solicitud ?? (await cargarSolicitud(supabase, params.solicitudId))
  if (!solicitud) return { ok: false, error: "No encontré esa reunión" }
  if (solicitud.estado !== "abierta") {
    return { ok: false, error: "Esa reunión ya no está abierta" }
  }
  if (!solicitud.socios_requeridos.includes(params.socioId)) {
    return { ok: false, error: "No estás entre los socios requeridos" }
  }

  const entrada = params.noPuede ? [] : params.franjas
  if (!params.noPuede && entrada.length === 0) {
    return {
      ok: false,
      error:
        "Cargá al menos una franja, o marcá que no podés en ninguno de estos días",
    }
  }

  if (
    entrada.some(
      (f) =>
        !FORMATO_FECHA.test(f.fecha) ||
        !FORMATO_HORA.test(f.desde) ||
        !FORMATO_HORA.test(f.hasta)
    )
  ) {
    return { ok: false, error: "Hay una franja con una hora que no entiendo" }
  }

  const ventana = ventanaComoIntervalo(solicitud)
  const franjas = entrada.map((f) => ({
    inicio: instanteEnZona(f.fecha, f.desde),
    // El editor no puede expresar "hasta medianoche" (el input de hora llega a
    // 23:59), así que 23:59 se toma como fin del día: si no, cada re-guardado
    // recortaría un minuto y se perdería el slot de 23:30.
    fin: instanteEnZona(f.fecha, f.hasta === "23:59" ? "24:00" : f.hasta),
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

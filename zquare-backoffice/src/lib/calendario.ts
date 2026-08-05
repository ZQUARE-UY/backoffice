import "server-only"

import { google, type calendar_v3 } from "googleapis"

import { ZONA_HORARIA, type Intervalo } from "@/lib/disponibilidad"
import { clienteJwt, clienteJwtComo } from "@/lib/google"

// Integración con Google Calendar. Las invitaciones de Zoom/Teams/Meet que
// mandan los clientes llegan por mail y Google Calendar las agrega solo, así
// que leer los calendarios de los socios alcanza para tener todo registrado.
// Cada socio comparte su calendario con la cuenta de servicio (permiso "ver
// todos los detalles"); acá se leen y unifican.
//
// Escribir es otra historia: crear un evento con invitados exige impersonar a
// un socio (delegación de dominio), ver `crearEventoReunion`.

const SCOPES_LECTURA = ["https://www.googleapis.com/auth/calendar.readonly"]
const SCOPES_ESCRITURA = ["https://www.googleapis.com/auth/calendar.events"]

// La zona vive en `disponibilidad.ts` (que no es server-only y por eso puede
// importarse desde el navegador); se reexporta acá por comodidad.
export { ZONA_HORARIA }

export type ProveedorVideo = "meet" | "zoom" | "teams" | "otro"

export type Reunion = {
  id: string
  titulo: string
  inicio: string // ISO; para eventos de día entero, la fecha (YYYY-MM-DD)
  fin: string | null
  todoElDia: boolean
  linkVideo: string | null
  proveedor: ProveedorVideo | null
  // Emails de los socios que participan (dueño del calendario + invitados).
  socios: string[]
}

export type Agenda = {
  reuniones: Reunion[]
  // Calendarios que no se pudieron leer (falta compartirlos con la cuenta).
  sinAcceso: string[]
}

const DOMINIOS_VIDEO: [RegExp, ProveedorVideo][] = [
  [/meet\.google\.com/, "meet"],
  [/zoom\.(us|com)/, "zoom"],
  [/teams\.(microsoft|live)\.com/, "teams"],
]

function detectarVideo(ev: calendar_v3.Schema$Event): {
  linkVideo: string | null
  proveedor: ProveedorVideo | null
} {
  const candidatos = [
    ...(ev.conferenceData?.entryPoints ?? [])
      .filter((p) => p.entryPointType === "video")
      .map((p) => p.uri),
    ev.hangoutLink,
    ...`${ev.location ?? ""} ${ev.description ?? ""}`.split(/\s+/),
  ].filter((u): u is string => Boolean(u && /^https?:\/\//.test(u)))

  for (const url of candidatos) {
    const conocido = DOMINIOS_VIDEO.find(([re]) => re.test(url))
    if (conocido) return { linkVideo: url, proveedor: conocido[1] }
  }
  // Link de conferencia sin dominio conocido (ej. Whereby): igual sirve.
  const generico = candidatos[0]
  return generico
    ? { linkVideo: generico, proveedor: "otro" }
    : { linkVideo: null, proveedor: null }
}

// Lee la agenda de los próximos `dias` días de todos los calendarios y
// unifica: la misma reunión (mismo iCalUID) aparece en el calendario de cada
// invitado; se fusiona en una sola con la lista de socios que van.
export async function listarAgenda(
  emails: string[],
  dias = 7
): Promise<Agenda> {
  const calendar = google.calendar({
    version: "v3",
    auth: clienteJwt(SCOPES_LECTURA),
  })

  const ahora = new Date()
  const hasta = new Date(ahora.getTime() + dias * 24 * 60 * 60 * 1000)

  const porUid = new Map<string, Reunion>()
  const sinAcceso: string[] = []
  const setSocios = new Set(emails.map((e) => e.toLowerCase()))

  await Promise.all(
    emails.map(async (email) => {
      let items: calendar_v3.Schema$Event[]
      try {
        const { data } = await calendar.events.list({
          calendarId: email,
          timeMin: ahora.toISOString(),
          timeMax: hasta.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 100,
        })
        items = data.items ?? []
      } catch {
        sinAcceso.push(email)
        return
      }

      for (const ev of items) {
        if (ev.status === "cancelled") continue
        const inicio = ev.start?.dateTime ?? ev.start?.date
        if (!inicio) continue

        // Socios del evento: el dueño del calendario + invitados @socios que
        // no rechazaron.
        const participantes = new Set<string>([email.toLowerCase()])
        for (const a of ev.attendees ?? []) {
          const mail = a.email?.toLowerCase()
          if (mail && setSocios.has(mail) && a.responseStatus !== "declined") {
            participantes.add(mail)
          }
        }

        const uid = ev.iCalUID ?? ev.id ?? `${email}-${inicio}`
        const previa = porUid.get(uid)
        if (previa) {
          for (const p of participantes) {
            if (!previa.socios.includes(p)) previa.socios.push(p)
          }
          continue
        }

        porUid.set(uid, {
          id: uid,
          titulo: ev.summary?.trim() || "(sin título)",
          inicio,
          fin: ev.end?.dateTime ?? ev.end?.date ?? null,
          todoElDia: !ev.start?.dateTime,
          ...detectarVideo(ev),
          socios: [...participantes],
        })
      }
    })
  )

  const reuniones = [...porUid.values()].sort((a, b) =>
    a.inicio.localeCompare(b.inicio)
  )
  return { reuniones, sinAcceso }
}

// Tramos ocupados de varios calendarios en una sola llamada. A diferencia de
// `listarAgenda` no trae detalles de los eventos, solo los bloques busy ya
// fusionados por Google, que es todo lo que necesita el cálculo de huecos.
// Los calendarios que no se pueden leer vuelven en `sinAcceso` en vez de
// romper: mejor proponer un hueco de más que no proponer ninguno.
export async function consultarBusy(
  emails: string[],
  desde: Date,
  hasta: Date
): Promise<{ busy: Intervalo[]; sinAcceso: string[] }> {
  if (emails.length === 0) return { busy: [], sinAcceso: [] }

  const calendar = google.calendar({
    version: "v3",
    auth: clienteJwt(SCOPES_LECTURA),
  })

  let calendarios: calendar_v3.Schema$FreeBusyResponse["calendars"]
  try {
    const { data } = await calendar.freebusy.query({
      requestBody: {
        timeMin: desde.toISOString(),
        timeMax: hasta.toISOString(),
        timeZone: ZONA_HORARIA,
        items: emails.map((id) => ({ id })),
      },
    })
    calendarios = data.calendars ?? {}
  } catch {
    // Falló la consulta entera (credenciales, red): seguimos sin busy.
    return { busy: [], sinAcceso: [...emails] }
  }

  const busy: Intervalo[] = []
  const sinAcceso: string[] = []
  for (const email of emails) {
    const cal = calendarios[email]
    // Los errores por calendario no tiran: vienen en la respuesta.
    if (!cal || (cal.errors ?? []).length > 0) {
      sinAcceso.push(email)
      continue
    }
    for (const tramo of cal.busy ?? []) {
      if (!tramo.start || !tramo.end) continue
      busy.push({
        inicio: Date.parse(tramo.start),
        fin: Date.parse(tramo.end),
      })
    }
  }
  return { busy, sinAcceso }
}

export type EventoCreado = {
  eventId: string
  calendarId: string
  meetUrl: string | null
  htmlLink: string | null
}

// Crea el evento en el calendario del socio organizador, con Meet y con las
// invitaciones ya mandadas. Se impersona al organizador porque una cuenta de
// servicio no puede agregar invitados por su cuenta.
export async function crearEventoReunion(opciones: {
  organizador: string
  titulo: string
  descripcion?: string | null
  inicio: Date
  fin: Date
  invitados: string[]
}): Promise<EventoCreado> {
  const { organizador, titulo, descripcion, inicio, fin, invitados } = opciones

  const calendar = google.calendar({
    version: "v3",
    auth: clienteJwtComo(SCOPES_ESCRITURA, organizador),
  })

  const otros = invitados.filter(
    (email) => email.toLowerCase() !== organizador.toLowerCase()
  )

  const { data } = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    sendUpdates: "all",
    requestBody: {
      summary: titulo,
      description: descripcion ?? undefined,
      start: { dateTime: inicio.toISOString(), timeZone: ZONA_HORARIA },
      end: { dateTime: fin.toISOString(), timeZone: ZONA_HORARIA },
      attendees: otros.map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  })

  if (!data.id) throw new Error("Google Calendar no devolvió el id del evento")

  const { linkVideo } = detectarVideo(data)
  return {
    eventId: data.id,
    calendarId: organizador,
    meetUrl: data.hangoutLink ?? linkVideo,
    htmlLink: data.htmlLink ?? null,
  }
}

// Borra el evento avisando a los invitados. Que ya no exista no es un error:
// alguien pudo haberlo borrado a mano desde su calendario.
export async function eliminarEventoReunion(
  organizador: string,
  eventId: string
): Promise<void> {
  const calendar = google.calendar({
    version: "v3",
    auth: clienteJwtComo(SCOPES_ESCRITURA, organizador),
  })

  try {
    await calendar.events.delete({
      calendarId: "primary",
      eventId,
      sendUpdates: "all",
    })
  } catch (error) {
    const codigo = (error as { code?: number })?.code
    if (codigo === 404 || codigo === 410) return
    throw error
  }
}

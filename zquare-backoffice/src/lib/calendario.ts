import "server-only"

import { google, type calendar_v3 } from "googleapis"

import { clienteJwt } from "@/lib/google"

// Integración con Google Calendar. Las invitaciones de Zoom/Teams/Meet que
// mandan los clientes llegan por mail y Google Calendar las agrega solo, así
// que leer los calendarios de los socios alcanza para tener todo registrado.
// Cada socio comparte su calendario con la cuenta de servicio (permiso "ver
// todos los detalles"); acá se leen y unifican.

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]

export const ZONA_HORARIA = "America/Montevideo"

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
    auth: clienteJwt(SCOPES),
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

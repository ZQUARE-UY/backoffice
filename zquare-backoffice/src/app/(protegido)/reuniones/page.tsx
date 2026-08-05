import Link from "next/link"
import { CalendarClockIcon, UsersIcon, VideoIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { etiquetaDia, etiquetaHora } from "@/lib/disponibilidad"
import {
  codigoReunion,
  type Cliente,
  type SolicitudReunion,
  type Socio,
} from "@/lib/dominio"
import { CAMPOS_SOLICITUD, fechaDeHoy } from "@/lib/reuniones"
import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"

import { NuevaSolicitud } from "./nueva-solicitud"

export const metadata = { title: "Reuniones" }

function Tarjeta({
  solicitud,
  nombreCliente,
  respondieron,
  requeridos,
  destacada,
}: {
  solicitud: SolicitudReunion
  nombreCliente: string | null
  respondieron: number
  requeridos: number
  destacada?: boolean
}) {
  return (
    <Link href={`/reuniones/${solicitud.id}`}>
      <Card
        className={`h-full transition-colors hover:bg-muted/50 ${destacada ? "border-primary/50" : ""}`}
      >
        <CardContent className="flex h-full flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {codigoReunion(solicitud.numero)}
            </span>
            {solicitud.estado === "abierta" ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <UsersIcon className="size-3.5" />
                {respondieron} de {requeridos}
              </span>
            ) : solicitud.meet_url ? (
              <VideoIcon className="size-3.5 text-muted-foreground" />
            ) : null}
          </div>

          <h3 className="leading-snug font-medium">{solicitud.titulo}</h3>

          {solicitud.estado === "agendada" && solicitud.inicio ? (
            <p className="text-sm">
              {etiquetaDia(Date.parse(solicitud.inicio))} a las{" "}
              {etiquetaHora(Date.parse(solicitud.inicio))}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Días candidatos: {solicitud.ventana_desde} al{" "}
              {solicitud.ventana_hasta}
            </p>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
            {nombreCliente && <Badge variant="secondary">{nombreCliente}</Badge>}
            <span className="ml-auto text-xs text-muted-foreground">
              {solicitud.duracion_min} min
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export default async function ReunionesPage() {
  const supabase = await createClient()
  const socioId = await idSocioActual()
  const hoy = await fechaDeHoy()

  const [
    { data: solicitudesData },
    { data: respuestasData },
    { data: sociosData },
    { data: clientesData },
    { data: proyectosData },
  ] = await Promise.all([
    supabase
      .from("solicitudes_reunion")
      .select(CAMPOS_SOLICITUD)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("reunion_respuestas").select("solicitud_id, socio_id"),
    supabase.from("socios").select("id, nombre, email").is("deleted_at", null),
    supabase
      .from("clientes")
      .select("id, nombre, email")
      .is("deleted_at", null)
      .order("nombre"),
    supabase
      .from("proyectos")
      .select("id, nombre, cliente_id")
      .is("deleted_at", null)
      .order("nombre"),
  ])

  const solicitudes = (solicitudesData ?? []) as SolicitudReunion[]
  const socios = (sociosData ?? []) as Socio[]
  const clientes = (clientesData ?? []) as Pick<
    Cliente,
    "id" | "nombre" | "email"
  >[]
  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]))

  const respuestas = (respuestasData ?? []) as {
    solicitud_id: string
    socio_id: string
  }[]
  const respondieronPor = new Map<string, Set<string>>()
  for (const r of respuestas) {
    const set = respondieronPor.get(r.solicitud_id) ?? new Set<string>()
    set.add(r.socio_id)
    respondieronPor.set(r.solicitud_id, set)
  }

  // Solo cuentan las respuestas de quienes siguen siendo requeridos, o el
  // contador puede mostrar "3 de 2" si a alguien se lo sacó después.
  const cuantosRespondieron = (s: SolicitudReunion) =>
    s.socios_requeridos.filter((id) => respondieronPor.get(s.id)?.has(id))
      .length

  const abiertas = solicitudes.filter((s) => s.estado === "abierta")
  const mias = socioId
    ? abiertas.filter(
        (s) =>
          s.socios_requeridos.includes(socioId) &&
          !respondieronPor.get(s.id)?.has(socioId)
      )
    : []
  const idsMias = new Set(mias.map((s) => s.id))
  const otrasAbiertas = abiertas.filter((s) => !idsMias.has(s.id))

  const agendadas = solicitudes
    .filter((s) => s.estado === "agendada" && s.inicio)
    .sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? ""))

  const canceladas = solicitudes.filter((s) => s.estado === "cancelada")

  const datos = (s: SolicitudReunion) => ({
    solicitud: s,
    nombreCliente: s.cliente_id ? (nombreCliente.get(s.cliente_id) ?? null) : null,
    respondieron: cuantosRespondieron(s),
    requeridos: s.socios_requeridos.length,
  })

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Reuniones</h1>
          <p className="text-muted-foreground">
            Abrí la encuesta, que cada uno marque cuándo puede y agendá sobre
            los huecos que quedan libres.
          </p>
        </div>
        <NuevaSolicitud
          socios={socios}
          clientes={clientes}
          proyectos={
            (proyectosData ?? []) as {
              id: string
              nombre: string
              cliente_id: string | null
            }[]
          }
          hoy={hoy}
        />
      </div>

      {solicitudes.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarClockIcon />
            </EmptyMedia>
            <EmptyTitle>Todavía no hay reuniones para coordinar</EmptyTitle>
            <EmptyDescription>
              Con &quot;Nueva reunión&quot; se abre la encuesta y a cada socio
              le queda pendiente marcar su disponibilidad.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {mias.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">
                  Pendientes de tu respuesta
                </h2>
                <span className="text-sm text-muted-foreground">
                  {mias.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mias.map((s) => (
                  <Tarjeta key={s.id} {...datos(s)} destacada />
                ))}
              </div>
            </section>
          )}

          {otrasAbiertas.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">Esperando a los demás</h2>
                <span className="text-sm text-muted-foreground">
                  {otrasAbiertas.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {otrasAbiertas.map((s) => (
                  <Tarjeta key={s.id} {...datos(s)} />
                ))}
              </div>
            </section>
          )}

          {agendadas.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">Agendadas</h2>
                <span className="text-sm text-muted-foreground">
                  {agendadas.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {agendadas.map((s) => (
                  <Tarjeta key={s.id} {...datos(s)} />
                ))}
              </div>
            </section>
          )}

          {canceladas.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">Canceladas</h2>
                <span className="text-sm text-muted-foreground">
                  {canceladas.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {canceladas.map((s) => (
                  <Tarjeta key={s.id} {...datos(s)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  )
}

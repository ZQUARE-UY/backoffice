import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, VideoIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  etiquetaDia,
  etiquetaHora,
  etiquetaHueco,
  franjasPorDia,
} from "@/lib/disponibilidad"
import {
  codigoReunion,
  ESTADOS_REUNION,
  type EstadoRespuesta,
  type RespuestaReunion,
} from "@/lib/dominio"
import { huecosDeSolicitud } from "@/lib/reuniones"
import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"

import { Huecos, type HuecoVista } from "./huecos"
import { MiRespuesta } from "./mi-respuesta"
import { SolicitudAcciones } from "./solicitud-acciones"

export const metadata = { title: "Reunión" }

const ETIQUETA_RESPUESTA: Record<
  EstadoRespuesta,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  respondio: { label: "Respondió", variant: "default" },
  no_puede: { label: "No puede", variant: "outline" },
  falta: { label: "Falta", variant: "secondary" },
}

export default async function ReunionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const resumen = await huecosDeSolicitud(id)
  if (!resumen) notFound()

  const { solicitud, huecos, socios, respondieron, requeridos, parcial, sinAcceso } =
    resumen

  const supabase = await createClient()
  const socioId = await idSocioActual()

  const [{ data: miRespuestaData }, { data: clienteData }, { data: proyectoData }] =
    await Promise.all([
      socioId
        ? supabase
            .from("reunion_respuestas")
            .select("id, solicitud_id, socio_id, franjas, comentario, created_at, updated_at")
            .eq("solicitud_id", id)
            .eq("socio_id", socioId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      solicitud.cliente_id
        ? supabase
            .from("clientes")
            .select("nombre, email")
            .eq("id", solicitud.cliente_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      solicitud.proyecto_id
        ? supabase
            .from("proyectos")
            .select("nombre")
            .eq("id", solicitud.proyecto_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

  const miRespuesta = miRespuestaData as RespuestaReunion | null
  const cliente = clienteData as { nombre: string; email: string | null } | null
  const proyecto = proyectoData as { nombre: string } | null

  const soyRequerido = Boolean(socioId && solicitud.socios_requeridos.includes(socioId))

  // Las franjas guardadas son instantes; el editor trabaja en hora de pared.
  const inicial = franjasPorDia(
    (miRespuesta?.franjas ?? []).map((f) => ({
      inicio: Date.parse(f.inicio),
      fin: Date.parse(f.fin),
    }))
  )

  const vistaHuecos: HuecoVista[] = huecos.map((hueco) => ({
    inicioIso: new Date(hueco.inicio).toISOString(),
    dia: etiquetaDia(hueco.inicio),
    hora: etiquetaHora(hueco.inicio),
    rango: etiquetaHueco(hueco),
  }))

  const invitados = socios.map((s) => s.socio.nombre)
  if (solicitud.invitar_cliente && cliente?.email) invitados.push(cliente.nombre)

  const errorCalendario = (solicitud.metadata as { error_calendario?: string })
    ?.error_calendario

  return (
    <>
      <div>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/reuniones" />}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Reuniones
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">
            {codigoReunion(solicitud.numero)}
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">
            {solicitud.titulo}
          </h1>
          <p className="text-muted-foreground">
            {solicitud.duracion_min} minutos
            {cliente ? ` · ${cliente.nombre}` : ""}
            {proyecto ? ` · ${proyecto.nombre}` : ""}
          </p>
        </div>
        <Badge variant={ESTADOS_REUNION[solicitud.estado].variant}>
          {ESTADOS_REUNION[solicitud.estado].label}
        </Badge>
      </div>

      {solicitud.notas && (
        <p className="text-sm whitespace-pre-wrap">{solicitud.notas}</p>
      )}

      {solicitud.estado === "agendada" && solicitud.inicio && (
        <Card>
          <CardHeader>
            <CardTitle className="capitalize">
              {etiquetaDia(Date.parse(solicitud.inicio))} a las{" "}
              {etiquetaHora(Date.parse(solicitud.inicio))}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Con {invitados.join(", ")}.
            </p>
            {solicitud.meet_url && (
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={
                    <a
                      href={solicitud.meet_url}
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                >
                  <VideoIcon data-icon="inline-start" />
                  Entrar a la videollamada
                </Button>
              </div>
            )}
            {errorCalendario && (
              <p className="text-sm text-destructive">
                No se pudo crear el evento en Google Calendar, así que las
                invitaciones no salieron: hay que mandarlas a mano. ({errorCalendario})
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Respondieron {respondieron} de {requeridos}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {socios.map(({ socio, estado }) => (
            <Badge key={socio.id} variant={ETIQUETA_RESPUESTA[estado].variant}>
              {socio.nombre} · {ETIQUETA_RESPUESTA[estado].label}
            </Badge>
          ))}
        </CardContent>
      </Card>

      {sinAcceso.length > 0 && (
        <p className="text-sm text-destructive">
          No pude leer el calendario de {sinAcceso.join(", ")}: puede que
          proponga horarios que en realidad están ocupados. Hay que compartir
          esos calendarios con la cuenta de servicio.
        </p>
      )}

      {solicitud.estado === "abierta" && soyRequerido && (
        <MiRespuesta
          solicitudId={solicitud.id}
          ventanaDesde={solicitud.ventana_desde}
          ventanaHasta={solicitud.ventana_hasta}
          inicial={inicial}
          yaRespondi={Boolean(miRespuesta)}
          noPuedo={Boolean(miRespuesta && miRespuesta.franjas.length === 0)}
        />
      )}

      {solicitud.estado === "abierta" && (
        <Huecos
          solicitudId={solicitud.id}
          huecos={vistaHuecos}
          parcial={parcial}
          faltan={socios
            .filter((s) => s.estado === "falta")
            .map((s) => s.socio.nombre)}
          invitados={invitados}
        />
      )}

      <SolicitudAcciones
        solicitudId={solicitud.id}
        estado={solicitud.estado}
        tieneEvento={Boolean(solicitud.google_event_id)}
      />
    </>
  )
}

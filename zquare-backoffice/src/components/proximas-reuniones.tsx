import { CalendarIcon, VideoIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  listarAgenda,
  ZONA_HORARIA,
  type ProveedorVideo,
  type Reunion,
} from "@/lib/calendario"
import { googleConfigurado } from "@/lib/google"
import { type Socio } from "@/lib/dominio"

const NOMBRE_PROVEEDOR: Record<ProveedorVideo, string> = {
  meet: "Meet",
  zoom: "Zoom",
  teams: "Teams",
  otro: "Video",
}

function claveDia(iso: string): string {
  return new Date(iso).toLocaleDateString("es-UY", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

function etiquetaDia(iso: string): string {
  const clave = claveDia(iso)
  const hoy = claveDia(new Date().toISOString())
  const maniana = claveDia(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  )
  if (clave === hoy) return "Hoy"
  if (clave === maniana) return "Mañana"
  return new Date(iso).toLocaleDateString("es-UY", {
    timeZone: ZONA_HORARIA,
    weekday: "long",
    day: "numeric",
    month: "numeric",
  })
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-UY", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

// Server component: agenda unificada de reuniones de los socios (próximos 7
// días) leída en vivo de sus calendarios de Google.
export async function ProximasReuniones({ socios }: { socios: Socio[] }) {
  if (!googleConfigurado() || socios.length === 0) return null

  let agenda
  try {
    agenda = await listarAgenda(socios.map((s) => s.email))
  } catch {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Próximas reuniones</CardTitle>
          <CardDescription>
            No se pudo leer Google Calendar. Verificá que la Calendar API esté
            habilitada en el proyecto de la cuenta de servicio.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const nombrePorEmail = new Map(
    socios.map((s) => [s.email.toLowerCase(), s.nombre.split(" ")[0]])
  )

  // Agrupar por día en zona horaria de Montevideo.
  const porDia = new Map<string, { etiqueta: string; items: Reunion[] }>()
  for (const r of agenda.reuniones) {
    const clave = claveDia(r.inicio)
    const grupo = porDia.get(clave) ?? {
      etiqueta: etiquetaDia(r.inicio),
      items: [],
    }
    grupo.items.push(r)
    porDia.set(clave, grupo)
  }

  const faltantes = agenda.sinAcceso
    .map((e) => nombrePorEmail.get(e.toLowerCase()) ?? e)
    .join(", ")

  return (
    <Card>
      <CardHeader>
        <CardTitle>Próximas reuniones</CardTitle>
        <CardDescription>
          Los próximos 7 días de los calendarios de los socios — las
          invitaciones de Zoom, Teams o Meet que llegan por mail aparecen acá
          solas.
          {faltantes && (
            <>
              {" "}
              <span className="text-destructive">
                Sin acceso al calendario de: {faltantes}
              </span>{" "}
              (hay que compartirlo con la cuenta de servicio).
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {agenda.reuniones.length === 0 ? (
          <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
            <CalendarIcon className="size-4" />
            No hay reuniones en los próximos 7 días.
          </div>
        ) : (
          [...porDia.values()].map((grupo) => (
            <div key={grupo.etiqueta} className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase">
                {grupo.etiqueta}
              </h3>
              <div className="flex flex-col divide-y rounded-lg border">
                {grupo.items.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 px-3 py-2 text-sm"
                  >
                    <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                      {r.todoElDia
                        ? "Todo el día"
                        : `${hora(r.inicio)}${r.fin ? `–${hora(r.fin)}` : ""}`}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {r.titulo}
                    </span>
                    <span className="hidden gap-1 sm:flex">
                      {r.socios.map((email) => {
                        const nombre = nombrePorEmail.get(email)
                        if (!nombre) return null
                        return (
                          <Badge key={email} variant="secondary">
                            {nombre}
                          </Badge>
                        )
                      })}
                    </span>
                    {r.linkVideo && (
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={
                          <a
                            href={r.linkVideo}
                            target="_blank"
                            rel="noopener noreferrer"
                          />
                        }
                      >
                        <VideoIcon data-icon="inline-start" />
                        {NOMBRE_PROVEEDOR[r.proveedor ?? "otro"]}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

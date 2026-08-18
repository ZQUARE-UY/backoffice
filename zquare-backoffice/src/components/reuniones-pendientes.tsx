import Link from "next/link"
import { CalendarClockIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { codigoReunion } from "@/lib/dominio"
import { solicitudesACoordinar } from "@/lib/reuniones"
import { cn } from "@/lib/utils"

// Reuniones que todavía se están coordinando. Se muestran a todos, arriba del
// dashboard: las que esperan la respuesta de quien mira van resaltadas y
// primero, porque son las que traban a los demás.
export async function ReunionesPendientes({ socioId }: { socioId: string }) {
  const abiertas = await solicitudesACoordinar(socioId)
  if (abiertas.length === 0) return null

  const ordenadas = [...abiertas].sort(
    (a, b) => Number(b.meFalta) - Number(a.meFalta)
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClockIcon className="size-4" />
          Reuniones a coordinar
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {ordenadas.slice(0, 6).map(({ solicitud, respondieron, requeridos, faltan, meFalta }) => (
          <Link
            key={solicitud.id}
            href={`/reuniones/${solicitud.id}`}
            className={cn(
              "flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/50",
              meFalta && "bg-primary/5"
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {codigoReunion(solicitud.numero)}
              </span>
              <span className="truncate">{solicitud.titulo}</span>
              {meFalta && <Badge>Te falta responder</Badge>}
            </span>
            <span
              className="shrink-0 text-xs text-muted-foreground"
              title={faltan.length > 0 ? `Faltan: ${faltan.join(", ")}` : undefined}
            >
              {respondieron} de {requeridos}
              {faltan.length > 0 && !meFalta && ` · falta ${faltan.join(", ")}`}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

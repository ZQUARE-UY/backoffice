import Link from "next/link"
import { CalendarClockIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { codigoReunion } from "@/lib/dominio"
import { solicitudesPendientes } from "@/lib/reuniones"

// Reuniones que esperan que el socio marque su disponibilidad. Se muestra
// arriba de todo en el dashboard porque es lo único que traba a los demás.
export async function ReunionesPendientes({ socioId }: { socioId: string }) {
  const pendientes = await solicitudesPendientes(socioId)
  if (pendientes.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClockIcon className="size-4" />
          Esperan tu disponibilidad
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {pendientes.slice(0, 5).map((solicitud) => (
          <Link
            key={solicitud.id}
            href={`/reuniones/${solicitud.id}`}
            className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
          >
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {codigoReunion(solicitud.numero)}
              </span>
              {solicitud.titulo}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {solicitud.ventana_desde} al {solicitud.ventana_hasta}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

import Link from "next/link"

import { EstadoProyectoBadge } from "@/components/estado-badge"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  briefProyectoCompleto,
  formatearMonto,
  proyectoComenzado,
  SALUD_PROYECTO,
  saludProyecto,
  TIPOS_PROYECTO,
  type Proyecto,
  type SaludProyecto,
} from "@/lib/dominio"

import { ComenzarProyecto } from "./comenzar-proyecto"

// El proyecto con lo que el listado necesita mostrar: el cliente ya resuelto.
export type ProyectoListado = Proyecto & {
  clientes: { nombre: string } | null
}

export function TarjetaProyecto({
  proyecto,
  responsable,
  tareasAbiertas,
  hoy,
  mostrarEstado = false,
}: {
  proyecto: ProyectoListado
  responsable: string | null
  tareasAbiertas: number
  hoy: Date
  mostrarEstado?: boolean
}) {
  const salud = saludProyecto(proyecto, hoy)
  const comenzado = proyectoComenzado(proyecto)

  return (
    // Toda la tarjeta entra al proyecto: el link del título se estira por
    // encima con un ::after (`before:`/`after:` de Tailwind) en vez de envolver
    // la tarjeta en un <a>. Así el enlace sigue siendo uno solo, con el nombre
    // del proyecto como texto accesible, y lo que tiene que quedar clickeable
    // aparte —el botón Comenzar— solo necesita su propio contexto de apilado.
    <Card className="relative h-full transition-colors hover:border-foreground/20 focus-within:border-foreground/20">
      <CardContent className="flex h-full flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {proyecto.clientes?.nombre ?? "Interno"}
          </span>
          {mostrarEstado ? (
            <EstadoProyectoBadge estado={proyecto.estado} />
          ) : (
            <SaludBadge salud={salud} />
          )}
        </div>

        <Link
          href={`/proyectos/${proyecto.id}`}
          className="font-medium leading-snug hover:underline after:absolute after:inset-0 after:content-['']"
        >
          {proyecto.nombre}
        </Link>

        {(proyecto.objetivo ?? proyecto.descripcion) && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {proyecto.objetivo ?? proyecto.descripcion}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
          {proyecto.tipo && (
            <Badge variant="outline">{TIPOS_PROYECTO[proyecto.tipo].label}</Badge>
          )}
          {mostrarEstado && <SaludBadge salud={salud} />}
          {proyecto.fecha_fin_estimada && <span>Fin {proyecto.fecha_fin_estimada}</span>}
          {proyecto.monto_acordado != null && (
            <span>{formatearMonto(proyecto.monto_acordado, proyecto.moneda)}</span>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <span className="text-xs text-muted-foreground">
            {responsable ?? "Sin responsable"}
            {tareasAbiertas > 0 && ` · ${tareasAbiertas} tareas abiertas`}
          </span>
          {!comenzado && proyecto.estado !== "cancelado" && (
            <div className="relative">
              <ComenzarProyecto
                id={proyecto.id}
                nombre={proyecto.nombre}
                // El brief mínimo puede estar ya cargado a mano: en ese caso
                // el diálogo ofrece marcar el arranque sin pasar por Claude.
                briefListo={briefProyectoCompleto(proyecto)}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function SaludBadge({ salud }: { salud: SaludProyecto }) {
  // "Al día" es el caso normal: mostrarlo en cada tarjeta es ruido.
  if (salud === "al_dia") return null
  return (
    <Badge variant={SALUD_PROYECTO[salud].variant}>
      {SALUD_PROYECTO[salud].label}
    </Badge>
  )
}

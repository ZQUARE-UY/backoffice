import { Badge } from "@/components/ui/badge"
import {
  ESTADOS_CLIENTE,
  ESTADOS_PRESUPUESTO,
  ESTADOS_PROYECTO,
  ESTADOS_TAREA,
  type EstadoCliente,
  type EstadoPresupuesto,
  type EstadoProyecto,
  type EstadoTarea,
} from "@/lib/dominio"

export function EstadoClienteBadge({ estado }: { estado: EstadoCliente }) {
  const info = ESTADOS_CLIENTE[estado]
  return <Badge variant={info.variant}>{info.label}</Badge>
}

export function EstadoProyectoBadge({ estado }: { estado: EstadoProyecto }) {
  const info = ESTADOS_PROYECTO[estado]
  return <Badge variant={info.variant}>{info.label}</Badge>
}

export function EstadoPresupuestoBadge({
  estado,
}: {
  estado: EstadoPresupuesto
}) {
  const info = ESTADOS_PRESUPUESTO[estado]
  return <Badge variant={info.variant}>{info.label}</Badge>
}

export function EstadoTareaBadge({ estado }: { estado: EstadoTarea }) {
  const info = ESTADOS_TAREA[estado]
  return <Badge variant={info.variant}>{info.label}</Badge>
}

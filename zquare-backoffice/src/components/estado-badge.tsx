import { Badge } from "@/components/ui/badge"
import {
  ESTADOS_CLIENTE,
  ESTADOS_PROYECTO,
  type EstadoCliente,
  type EstadoProyecto,
} from "@/lib/dominio"

export function EstadoClienteBadge({ estado }: { estado: EstadoCliente }) {
  const info = ESTADOS_CLIENTE[estado]
  return <Badge variant={info.variant}>{info.label}</Badge>
}

export function EstadoProyectoBadge({ estado }: { estado: EstadoProyecto }) {
  const info = ESTADOS_PROYECTO[estado]
  return <Badge variant={info.variant}>{info.label}</Badge>
}

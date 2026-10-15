import {
  ESTADOS_PROYECTO,
  formatearMonto,
  saludProyecto,
  type EstadoProyecto,
  type Proyecto,
} from "@/lib/dominio"
import { diasHasta, fechaCorta } from "@/lib/formato"
import { cn } from "@/lib/utils"

// Piezas visuales de Proyectos (rediseño): listado y ficha.

// Estado comercial: en curso en lima (el único acento), entregado en tinta,
// el resto neutro.
const ESTILO_ESTADO: Record<EstadoProyecto, string> = {
  propuesta: "bg-muted text-foreground",
  en_curso: "bg-lima text-carbon",
  entregado: "bg-foreground text-background",
  mantenimiento: "bg-muted text-foreground",
  cancelado: "bg-muted text-muted-foreground",
}

export function BadgeEstadoProyecto({ estado }: { estado: EstadoProyecto }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 text-xs leading-[22px] font-semibold whitespace-nowrap",
        ESTILO_ESTADO[estado]
      )}
    >
      {ESTADOS_PROYECTO[estado].label}
    </span>
  )
}

// Salud como texto con tono. Un proyecto cerrado no tiene salud: "—".
export function SaludTexto({
  proyecto,
  hoy,
}: {
  proyecto: Pick<Proyecto, "estado" | "fecha_fin_estimada">
  hoy: Date
}) {
  if (proyecto.estado === "entregado" || proyecto.estado === "cancelado") {
    return <span className="text-muted-foreground">—</span>
  }
  const salud = saludProyecto(proyecto, hoy)
  const [texto, clase] = {
    atrasado: ["Atrasado", "font-semibold text-negativo"],
    vence_pronto: ["Vence pronto", "font-semibold text-aviso"],
    al_dia: ["Al día", "font-semibold text-positivo"],
    sin_fecha: ["Sin fecha", "text-muted-foreground"],
  }[salud]
  return <span className={clase}>{texto}</span>
}

// Cuánto falta para una fecha, para la nota bajo "Fin": "Mañana",
// "En 4 días", "En 8 semanas", "Venció hace 3 días".
export function faltaPara(fecha: string): { texto: string; tono: "negativo" | "aviso" | null } {
  const n = diasHasta(fecha)
  if (n < -1) return { texto: `Venció hace ${-n} días`, tono: "negativo" }
  if (n === -1) return { texto: "Venció ayer", tono: "negativo" }
  if (n === 0) return { texto: "Hoy", tono: "aviso" }
  if (n === 1) return { texto: "Mañana", tono: "aviso" }
  if (n < 14) return { texto: `En ${n} días`, tono: n <= 7 ? "aviso" : null }
  return { texto: `En ${Math.round(n / 7)} semanas`, tono: null }
}

// Fin de un proyecto: la fecha y, si sigue abierto, cuánto falta.
export function finProyecto(
  proyecto: Pick<Proyecto, "estado" | "fecha_fin_estimada" | "fecha_fin_real">
): { fecha: string; nota: string; tono: "negativo" | "aviso" | null } {
  if (proyecto.estado === "entregado" && proyecto.fecha_fin_real) {
    return { fecha: fechaCorta(proyecto.fecha_fin_real), nota: "Entregado", tono: null }
  }
  if (!proyecto.fecha_fin_estimada) return { fecha: "—", nota: "", tono: null }
  const cerrado = proyecto.estado === "entregado" || proyecto.estado === "cancelado"
  const falta = faltaPara(proyecto.fecha_fin_estimada)
  return {
    fecha: fechaCorta(proyecto.fecha_fin_estimada),
    nota: cerrado ? "" : falta.texto,
    tono: cerrado ? null : falta.tono,
  }
}

export const TONO_TEXTO = { negativo: "text-negativo", aviso: "text-aviso" } as const

// Barra de avance fina con su texto.
export function BarraAvance({
  hechas,
  total,
  className,
}: {
  hechas: number
  total: number
  className?: string
}) {
  const pct = total > 0 ? Math.round((hechas / total) * 100) : 0
  return (
    <span
      role="img"
      aria-label={`${hechas} de ${total} hechas (${pct}%)`}
      className={cn("block h-1.5 overflow-hidden rounded-full bg-muted", className)}
    >
      <span className="block h-full rounded-full bg-foreground" style={{ width: `${pct}%` }} />
    </span>
  )
}

// Plata de un proyecto para el listado: lo acordado, o el presupuesto más
// firme, o nada (con una nota que invita a cargarlo si está en curso).
export function plataProyecto(
  proyecto: Pick<Proyecto, "estado" | "monto_acordado" | "moneda">,
  presupuesto: { total: number; moneda: string; estado: string } | null
): { monto: string | null; nota: string } {
  if (proyecto.monto_acordado != null) {
    return { monto: formatearMonto(proyecto.monto_acordado, proyecto.moneda), nota: "Acordado" }
  }
  if (presupuesto && presupuesto.total > 0) {
    return {
      monto: formatearMonto(presupuesto.total, presupuesto.moneda),
      nota: presupuesto.estado === "aprobado" ? "Presupuesto aprobado" : "Presupuesto enviado",
    }
  }
  return { monto: null, nota: proyecto.estado === "en_curso" ? "Cargar lo acordado" : "" }
}

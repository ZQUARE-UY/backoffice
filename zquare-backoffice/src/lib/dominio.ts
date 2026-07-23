// Catálogos de estados y etiquetas del dominio. Al ser catálogos (no enums de
// Postgres), agregar un estado es solo sumar una entrada acá y en el check
// constraint de la migración correspondiente.

export const ESTADOS_CLIENTE = {
  potencial: { label: "Potencial", variant: "secondary" as const },
  activo: { label: "Activo", variant: "default" as const },
  inactivo: { label: "Inactivo", variant: "outline" as const },
}

export type EstadoCliente = keyof typeof ESTADOS_CLIENTE

export const ESTADOS_PROYECTO = {
  propuesta: { label: "Propuesta", variant: "secondary" as const },
  en_curso: { label: "En curso", variant: "default" as const },
  entregado: { label: "Entregado", variant: "outline" as const },
  mantenimiento: { label: "Mantenimiento", variant: "outline" as const },
  cancelado: { label: "Cancelado", variant: "outline" as const },
}

export type EstadoProyecto = keyof typeof ESTADOS_PROYECTO

export const ESTADOS_PRESUPUESTO = {
  borrador: { label: "Borrador", variant: "secondary" as const },
  enviado: { label: "Enviado", variant: "default" as const },
  aprobado: { label: "Aprobado", variant: "outline" as const },
  rechazado: { label: "Rechazado", variant: "outline" as const },
}

export type EstadoPresupuesto = keyof typeof ESTADOS_PRESUPUESTO

export const MONEDAS = ["USD", "UYU"] as const
export type Moneda = (typeof MONEDAS)[number]

export function formatearMonto(
  monto: number | null,
  moneda: string | null
): string {
  if (monto == null) return "—"
  return `${moneda ?? ""} ${monto.toLocaleString("es-UY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`.trim()
}

export type Cliente = {
  id: string
  nombre: string
  empresa: string | null
  email: string | null
  telefono: string | null
  estado: EstadoCliente
  origen: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

export type Proyecto = {
  id: string
  cliente_id: string
  nombre: string
  descripcion: string | null
  estado: EstadoProyecto
  fecha_inicio: string | null
  fecha_fin_estimada: string | null
  fecha_fin_real: string | null
  horas_estimadas: number | null
  horas_reales: number | null
  monto_acordado: number | null
  moneda: Moneda | null
  created_at: string
  updated_at: string
}

export type Presupuesto = {
  id: string
  cliente_id: string
  proyecto_id: string | null
  version: number
  estado: EstadoPresupuesto
  moneda: Moneda
  fecha_envio: string | null
  total: number
  notas: string | null
  drive_url: string | null
  created_at: string
  updated_at: string
}

export type PresupuestoItem = {
  id: string
  presupuesto_id: string
  descripcion: string
  horas: number | null
  tarifa: number
  subtotal: number
  orden: number
}

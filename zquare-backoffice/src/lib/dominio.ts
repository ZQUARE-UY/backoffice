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

export const MONEDAS = ["USD", "UYU"] as const
export type Moneda = (typeof MONEDAS)[number]

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

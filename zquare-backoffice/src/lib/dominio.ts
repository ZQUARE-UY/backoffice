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

// Columnas del tablero de tareas. El orden de las claves es el orden en que se
// muestran las columnas.
export const ESTADOS_TAREA = {
  backlog: { label: "Backlog", variant: "outline" as const },
  por_hacer: { label: "Por hacer", variant: "secondary" as const },
  en_curso: { label: "En curso", variant: "default" as const },
  en_revision: { label: "En revisión", variant: "secondary" as const },
  hecho: { label: "Hecho", variant: "outline" as const },
}

export type EstadoTarea = keyof typeof ESTADOS_TAREA

export const ESTADOS_TAREA_ORDEN = Object.keys(ESTADOS_TAREA) as EstadoTarea[]

// Columnas visibles en el tablero: todo menos backlog, que tiene vista propia
// (lista priorizada, estilo Jira).
export const ESTADOS_TABLERO = ESTADOS_TAREA_ORDEN.filter((e) => e !== "backlog")

export const PRIORIDADES_TAREA = {
  baja: { label: "Baja", variant: "outline" as const },
  media: { label: "Media", variant: "secondary" as const },
  alta: { label: "Alta", variant: "default" as const },
  urgente: { label: "Urgente", variant: "destructive" as const },
}

export type PrioridadTarea = keyof typeof PRIORIDADES_TAREA

// Identificador corto para hablar de una tarjeta ("ZQ-12"), el mismo que se
// muestra en el tablero y devuelve el MCP.
export function codigoTarea(numero: number): string {
  return `ZQ-${numero}`
}

// Brief de desarrollo de una tarjeta: campo de la tabla → label. Compartido
// entre la UI (detalle y formulario) y el snapshot de versiones. Los
// placeholders son las preguntas que responde cada campo, pensadas para que
// otro agente pueda resolver la tarjeta sin más contexto.
export const BRIEF_TAREA = {
  contexto: {
    label: "Contexto",
    placeholder: "Por qué existe: qué problema o pedido la origina y qué se sabe ya",
  },
  resultado: {
    label: "Resultado esperado",
    placeholder: "Qué tiene que ser verdad al terminar: criterios de aceptación verificables",
  },
  recursos: {
    label: "Recursos",
    placeholder: "Links, documentos, repos, accesos y personas a consultar",
  },
  plan: {
    label: "Plan sugerido",
    placeholder: "Pasos en orden para resolverla; quien la agarre puede ajustarlos",
  },
}

export type CampoBrief = keyof typeof BRIEF_TAREA

export const CAMPOS_BRIEF = Object.keys(BRIEF_TAREA) as CampoBrief[]

// Una tarjeta "sin desarrollar" es la que todavía no tiene brief: el tablero
// la marca y el MCP la reporta como `desarrollada: false`.
export function briefVacio(tarea: Pick<Tarea, CampoBrief>): boolean {
  return CAMPOS_BRIEF.every((campo) => !tarea[campo])
}

// Ciclo de vida de una idea del banco. El orden de las claves es el orden en
// que se muestran las secciones en /ideas.
export const ESTADOS_IDEA = {
  semilla: { label: "Semilla", variant: "outline" as const },
  en_exploracion: { label: "En exploración", variant: "secondary" as const },
  lista: { label: "Lista", variant: "default" as const },
  aprobada: { label: "Aprobada", variant: "default" as const },
  descartada: { label: "Descartada", variant: "outline" as const },
}

export type EstadoIdea = keyof typeof ESTADOS_IDEA

export const ESTADOS_IDEA_ORDEN = Object.keys(ESTADOS_IDEA) as EstadoIdea[]

// Secciones del one-pager: campo de la tabla → label. Compartido entre la UI
// (detalle y formulario) y el snapshot de versiones.
export const ONE_PAGER_IDEA = {
  problema: { label: "Problema", placeholder: "Qué problema real resuelve y a quién le duele" },
  competencia: { label: "Competencia", placeholder: "Quién lo resuelve hoy, a qué precio, y cuál sería nuestro diferencial" },
  solucion: { label: "Solución propuesta", placeholder: "Cómo se resuelve, versión mínima primero" },
  esfuerzo: { label: "Esfuerzo estimado", placeholder: "Qué implica construirla (tiempo, plata, dependencias)" },
  impacto: { label: "Impacto esperado", placeholder: "Qué cambia si funciona, cómo se mide" },
  proximos_pasos: { label: "Próximos pasos", placeholder: "Qué habría que hacer primero para validarla" },
}

export type CampoOnePager = keyof typeof ONE_PAGER_IDEA

// Identificador corto para hablar de una idea ("IDEA-7"), el mismo que se
// muestra en /ideas y devuelve el MCP.
export function codigoIdea(numero: number): string {
  return `IDEA-${numero}`
}

export const TIPOS_DOCUMENTO = {
  analisis: { label: "Análisis" },
  propuesta: { label: "Propuesta" },
  contrato: { label: "Contrato" },
  informe: { label: "Informe" },
  minuta: { label: "Minuta" },
  otro: { label: "Otro" },
}

export type TipoDocumento = keyof typeof TIPOS_DOCUMENTO

export const MONEDAS = ["USD", "UYU"] as const
export type Moneda = (typeof MONEDAS)[number]

// Tipos de movimiento financiero (modelo Splitwise). `signo` indica si suma (+)
// o resta (−) al resultado de la empresa.
export const TIPOS_MOVIMIENTO = {
  ingreso: { label: "Ingreso", variant: "default" as const, signo: 1 },
  gasto: { label: "Gasto", variant: "destructive" as const, signo: -1 },
}

export type TipoMovimiento = keyof typeof TIPOS_MOVIMIENTO

// Valor especial para "pagado por" cuando el pago sale del fondo común de la
// empresa (en la base se guarda como socio_id NULL).
export const FONDO_COMUN = "fondo_comun"

// Categorías sugeridas (no obligatorias): se muestran como datalist y se puede
// escribir una libre. Consolidar una nueva es solo sumarla acá.
export const CATEGORIAS_SUGERIDAS = [
  "Cobro a cliente",
  "Software y servicios",
  "Diseño",
  "Infraestructura",
  "Dominio y hosting",
  "Legal y contable",
  "Marketing",
  "Oficina",
  "Impuestos",
  "Otro",
]

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

// Atajo para montos ya consolidados en USD: redondea a centavos y formatea.
export function formatearUsd(monto: number): string {
  return formatearMonto(Math.round(monto * 100) / 100, "USD")
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
  drive_folder_id: string | null
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
  drive_folder_id: string | null
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

export type Documento = {
  id: string
  cliente_id: string
  proyecto_id: string | null
  tipo: TipoDocumento
  titulo: string
  drive_url: string
  tags: string[]
  fecha: string
  created_at: string
  updated_at: string
}

export type Decision = {
  id: string
  titulo: string
  detalle: string | null
  fecha: string
  participantes: string[]
  cliente_id: string | null
  proyecto_id: string | null
  created_at: string
  updated_at: string
}

export type Tarea = {
  id: string
  numero: number
  titulo: string
  descripcion: string | null
  contexto: string | null
  resultado: string | null
  recursos: string | null
  plan: string | null
  estado: EstadoTarea
  prioridad: PrioridadTarea
  asignado_a: string | null
  cliente_id: string | null
  proyecto_id: string | null
  etiquetas: string[]
  fecha_limite: string | null
  orden: number
  created_at: string
  updated_at: string
}

export type ComentarioTarea = {
  id: string
  tarea_id: string
  cuerpo: string
  autor: string
  autor_socio_id: string | null
  created_at: string
}

export type VersionTarea = {
  id: string
  tarea_id: string
  autor: string
  created_at: string
}

export type Idea = {
  id: string
  numero: number
  titulo: string
  descripcion: string | null
  problema: string | null
  competencia: string | null
  solucion: string | null
  esfuerzo: string | null
  impacto: string | null
  proximos_pasos: string | null
  estado: EstadoIdea
  etiquetas: string[]
  proyecto_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ComentarioIdea = {
  id: string
  idea_id: string
  cuerpo: string
  autor: string
  autor_socio_id: string | null
  created_at: string
}

export type VersionIdea = {
  id: string
  idea_id: string
  snapshot: Record<string, unknown>
  autor: string
  autor_socio_id: string | null
  created_at: string
}

export type VotoIdea = {
  idea_id: string
  socio_id: string
}

export type Socio = {
  id: string
  nombre: string
  email: string
}

export type Movimiento = {
  id: string
  tipo: TipoMovimiento
  fecha: string
  moneda: Moneda
  monto: number
  tc_a_usd: number
  monto_usd: number
  categoria: string | null
  descripcion: string | null
  socio_id: string | null
  cliente_id: string | null
  proyecto_id: string | null
  comprobante_url: string | null
  created_at: string
  updated_at: string
}

export type BalanceSocio = {
  socio_id: string
  nombre: string
  pagado_usd: number
  saldo_usd: number
}

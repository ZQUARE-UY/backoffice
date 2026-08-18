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

// El orden de las claves es el orden en que se muestran las secciones en
// /proyectos: primero lo que está por arrancar, al final lo que ya no se toca.
export const ESTADOS_PROYECTO_ORDEN = Object.keys(
  ESTADOS_PROYECTO
) as EstadoProyecto[]

// Clase de trabajo del proyecto. Decide qué tareas de setup propone el
// inicializador y qué preguntas extra hace la entrevista de kickoff.
export const TIPOS_PROYECTO = {
  desarrollo: {
    label: "Desarrollo a medida",
    descripcion: "Producto o sistema nuevo para un cliente",
  },
  integracion: {
    label: "Integración",
    descripcion: "Conectar sistemas que ya existen",
  },
  mantenimiento: {
    label: "Mantenimiento",
    descripcion: "Soporte y evolución de algo ya entregado",
  },
  interno: {
    label: "Interno",
    descripcion: "Producto propio de ZQUARE, sin cliente",
  },
}

export type TipoProyecto = keyof typeof TIPOS_PROYECTO

export const TIPOS_PROYECTO_ORDEN = Object.keys(
  TIPOS_PROYECTO
) as TipoProyecto[]

// Brief de arranque: campo de la tabla → label. Compartido entre la UI
// (ficha y formulario), el snapshot de versiones y el MCP. Los placeholders
// son las preguntas que responde cada campo — las mismas que hace el prompt
// `comenzar_proyecto`, para que llenar el brief a mano o con Claude dé lo
// mismo.
export const BRIEF_PROYECTO = {
  objetivo: {
    label: "Objetivo",
    placeholder:
      "Qué problema del cliente resuelve y cómo sabremos que valió la pena",
  },
  alcance: {
    label: "Alcance",
    placeholder: "Qué entra: funcionalidades, entregables, integraciones",
  },
  fuera_de_alcance: {
    label: "Fuera de alcance",
    placeholder:
      "Qué NO entra. Es lo que evita las discusiones del mes tres",
  },
  stakeholders: {
    label: "Stakeholders",
    placeholder:
      "Quién decide del lado del cliente, quién valida, quién da accesos y por qué canal",
  },
  stack_y_repos: {
    label: "Stack y repos",
    placeholder: "Tecnologías acordadas, repos y convenciones que aplican",
  },
  entornos_y_accesos: {
    label: "Entornos y accesos",
    placeholder:
      "Local, staging y producción; credenciales y accesos a pedir, y a quién",
  },
  riesgos: {
    label: "Riesgos",
    placeholder:
      "Qué puede salir mal y qué haríamos: dependencias del cliente, incógnitas técnicas, plazos",
  },
  definicion_de_hecho: {
    label: "Definición de hecho",
    placeholder:
      "Qué tiene que cumplir una tarjeta para estar hecha en este proyecto (tests, review, deploy, aceptación)",
  },
  hitos: {
    label: "Hitos",
    placeholder:
      "Entregas intermedias con fecha: contra qué se mide el avance y qué se factura",
  },
}

export type CampoBriefProyecto = keyof typeof BRIEF_PROYECTO

export const CAMPOS_BRIEF_PROYECTO = Object.keys(
  BRIEF_PROYECTO
) as CampoBriefProyecto[]

// Tareas de setup que propone el inicializador según el tipo de proyecto.
// Viven en código y no en la base a propósito: son una convención de la
// empresa que se versiona con el repo, igual que los estándares. Los códigos
// TEC-N los asigna quien las crea, en orden.
export const PLANTILLAS_SETUP: Record<TipoProyecto, string[]> = {
  desarrollo: [
    "Crear el repositorio y aplicar la estructura estándar de ZQUARE",
    "Configurar CI (lint, build y tests en cada push)",
    "Levantar entorno de staging con deploy automático",
    "Pedir y guardar los accesos y credenciales del cliente",
    "Abrir el canal de comunicación con el cliente y agendar la cadencia de reuniones",
    "Escribir el documento de arranque y compartirlo con el cliente",
  ],
  integracion: [
    "Conseguir documentación y credenciales de sandbox de cada sistema a integrar",
    "Probar de punta a punta el caso más simple contra sandbox",
    "Definir el manejo de errores y reintentos entre sistemas",
    "Configurar monitoreo y alertas de la integración",
    "Acordar con el cliente la ventana y el plan de puesta en producción",
  ],
  mantenimiento: [
    "Traspaso: repos, accesos, documentación y deudas conocidas",
    "Acordar el SLA de respuesta y el canal de reporte de incidentes",
    "Revisar el monitoreo existente y completar lo que falte",
    "Levantar el inventario de dependencias y su estado de actualización",
  ],
  interno: [
    "Crear el repositorio y aplicar la estructura estándar de ZQUARE",
    "Definir la métrica que dice si el producto funciona",
    "Acordar cuánto tiempo por semana le dedica cada socio",
    "Configurar CI y el primer deploy",
  ],
}

// Un proyecto está "sin comenzar" mientras nadie corrió el arranque
// estandarizado. Es a propósito independiente del estado comercial: un
// proyecto puede pasar a `en_curso` porque el cliente firmó y aun así no
// haberse arrancado como corresponde — ese hueco es justo lo que el listado
// tiene que mostrar.
export function proyectoComenzado(
  proyecto: Pick<Proyecto, "kickoff_completado_at">
): boolean {
  return Boolean(proyecto.kickoff_completado_at)
}

// El brief está completo cuando están los cuatro campos que hacen falta para
// que alguien más agarre el proyecto sin preguntar: para qué es, qué entra,
// qué no, y con quién se habla. El resto suma pero no bloquea.
export const CAMPOS_BRIEF_MINIMO: CampoBriefProyecto[] = [
  "objetivo",
  "alcance",
  "fuera_de_alcance",
  "stakeholders",
]

export function briefProyectoCompleto(
  proyecto: Pick<Proyecto, CampoBriefProyecto>
): boolean {
  return CAMPOS_BRIEF_MINIMO.every((campo) => proyecto[campo])
}

export function briefProyectoVacio(
  proyecto: Pick<Proyecto, CampoBriefProyecto>
): boolean {
  return CAMPOS_BRIEF_PROYECTO.every((campo) => !proyecto[campo])
}

// Salud del proyecto: derivada de las fechas, nunca editada a mano. Es el
// semáforo del listado y el primer insumo del estimador (horas estimadas vs.
// reales) que está en el PLAN.
export const SALUD_PROYECTO = {
  atrasado: { label: "Atrasado", variant: "destructive" as const },
  vence_pronto: { label: "Vence pronto", variant: "secondary" as const },
  al_dia: { label: "Al día", variant: "outline" as const },
  sin_fecha: { label: "Sin fecha", variant: "outline" as const },
}

export type SaludProyecto = keyof typeof SALUD_PROYECTO

// Cuántos días antes del vencimiento se enciende la luz amarilla.
export const DIAS_VENCE_PRONTO = 14

// `hoy` se pasa por parámetro para que el resultado sea determinista: el
// servidor y el cliente tienen que llegar al mismo valor o React se queja de
// la hidratación.
export function saludProyecto(
  proyecto: Pick<Proyecto, "estado" | "fecha_fin_estimada">,
  hoy: Date
): SaludProyecto {
  // Un proyecto cerrado no tiene salud que medir: ya no se puede atrasar.
  if (proyecto.estado === "entregado" || proyecto.estado === "cancelado") {
    return "al_dia"
  }
  if (!proyecto.fecha_fin_estimada) return "sin_fecha"

  const dias = Math.ceil(
    (new Date(`${proyecto.fecha_fin_estimada}T00:00:00Z`).getTime() -
      Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())) /
      86_400_000
  )

  if (dias < 0) return "atrasado"
  if (dias <= DIAS_VENCE_PRONTO) return "vence_pronto"
  return "al_dia"
}

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

// MoSCoW: alcance del release, no urgencia. Es otra cosa que `prioridad` y por
// eso vive en su propio campo — la regla 60/20/20 de 01-gestion-requisitos §6
// necesita el valor exacto, y "alta" no dice si algo es Must o Should.
export const MOSCOW_TAREA = {
  must: { label: "Must have", variant: "default" as const },
  should: { label: "Should have", variant: "secondary" as const },
  could: { label: "Could have", variant: "outline" as const },
  wont: { label: "Won't have", variant: "outline" as const },
}

export type MoscowTarea = keyof typeof MOSCOW_TAREA

export const MOSCOW_ORDEN = Object.keys(MOSCOW_TAREA) as MoscowTarea[]

// Fibonacci, según 01-gestion-requisitos §3.4. Una US de 13 no entra a un
// sprint: se parte primero. La base la acepta igual —una tarjeta puede estar
// estimada en 13 mientras espera que la partan— y esa regla la aplica quien
// planifica.
export const PUNTOS_TAREA = [1, 2, 3, 5, 8, 13] as const

// Código de la tarjeta dentro de su proyecto (US-014, DEF-07, SC-3, TEC-2).
// Distinto de `numero`, que es el ZQ-N de la empresa: este es el que enlaza
// con el requisito y el que usa la convención de ramas del estándar.
export const RE_CODIGO_PROYECTO = /^(US|DEF|SC|TEC)-\d+$/
export const RE_EPICA = /^EP-\d+$/

// Tipo de trabajo derivado del prefijo del código, que es lo que decide el
// tipo de rama (US → feat, DEF → fix).
export function tipoDeCodigo(codigo: string | null): string | null {
  return codigo?.match(RE_CODIGO_PROYECTO)?.[1] ?? null
}

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

// Brief sin empezar: no hay nada de nada. Distingue el caso "todavía nadie la
// tocó" (se muestra el aviso para desarrollarla) del brief a medio hacer.
export function briefVacio(tarea: Pick<Tarea, CampoBrief>): boolean {
  return CAMPOS_BRIEF.every((campo) => !tarea[campo])
}

// Una tarjeta está "desarrollada" cuando tiene `resultado`, no con que tenga
// cualquier campo del brief: el resultado es lo que la vuelve resoluble y
// verificable — es contra eso que un agente chequea si terminó (ver la
// descripción de `ficha_tarea` en el MCP). Sin él, tener contexto no alcanza:
// las tarjetas que salen de graduar una idea nacen justo así, con contexto y
// sin criterios, y son las que más necesitan una pasada de `desarrollar_tarea`.
export function tareaDesarrollada(tarea: Pick<Tarea, CampoBrief>): boolean {
  return Boolean(tarea.resultado)
}

// Sprints del tablero (estilo Jira). Uno activo a la vez: se planifica en la
// vista Backlog, se inicia (sus tarjetas entran al tablero) y se completa (lo
// hecho queda archivado en él y lo pendiente vuelve al backlog o pasa al
// siguiente; el tablero queda limpio).
export const ESTADOS_SPRINT = {
  planificado: { label: "Planificado", variant: "outline" as const },
  activo: { label: "Activo", variant: "default" as const },
  cerrado: { label: "Cerrado", variant: "secondary" as const },
}

export type EstadoSprint = keyof typeof ESTADOS_SPRINT

export type Sprint = {
  id: string
  numero: number
  nombre: string
  objetivo: string | null
  estado: EstadoSprint
  fecha_inicio: string | null
  fecha_fin: string | null
  iniciado_at: string | null
  cerrado_at: string | null
  proyecto_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// Nombre corto y estable de un sprint para hablar de él ("Sprint 3"), como
// ZQ-N en tareas. `nombre` es el título libre que le pone el equipo.
export function codigoSprint(numero: number): string {
  return `Sprint ${numero}`
}

// Días que le quedan a un sprint activo (negativo si ya se pasó). Null si no
// tiene fecha de fin.
export function diasRestantesSprint(
  sprint: Pick<Sprint, "fecha_fin">,
  hoy: Date = new Date()
): number | null {
  if (!sprint.fecha_fin) return null
  const fin = new Date(`${sprint.fecha_fin}T00:00:00`)
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.round((fin.getTime() - inicioHoy.getTime()) / 86_400_000)
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
  // Null = proyecto interno de ZQUARE (ej. graduado del banco de ideas).
  cliente_id: string | null
  nombre: string
  descripcion: string | null
  estado: EstadoProyecto
  // Socio a cargo. Null = todavía sin dueño asignado.
  responsable_id: string | null
  tipo: TipoProyecto | null
  // Brief de arranque (ver BRIEF_PROYECTO).
  objetivo: string | null
  alcance: string | null
  fuera_de_alcance: string | null
  stakeholders: string | null
  stack_y_repos: string | null
  entornos_y_accesos: string | null
  riesgos: string | null
  definicion_de_hecho: string | null
  hitos: string | null
  // Null = el arranque estandarizado todavía no se corrió.
  kickoff_completado_at: string | null
  kickoff_por: string | null
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

// Una anotación sobre un archivo de Drive: el tipo, de quién es y sus tags.
// El catálogo de archivos es Drive, no esta tabla — ver la migración
// 20260817000002. `cliente_id` es null en los archivos sueltos (plantillas,
// cosas de la empresa) y `drive_file_id` es la clave que une la anotación con
// el archivo real y con sus fragmentos en el índice de búsqueda.
export type Documento = {
  id: string
  cliente_id: string | null
  proyecto_id: string | null
  drive_file_id: string | null
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
  codigo_proyecto: string | null
  estimacion: number | null
  moscow: MoscowTarea | null
  epica: string | null
  asignado_a: string | null
  cliente_id: string | null
  proyecto_id: string | null
  sprint_id: string | null
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
  metadata: MetadataIdea
  created_by: string | null
  created_at: string
  updated_at: string
}

// metadata.graduacion: qué generó la idea al graduarse (etapa 3). Las tareas
// se guardan por número (código ZQ-N) para mostrarlas sin joins.
export type MetadataIdea = {
  graduacion?: {
    destino: "proyecto" | "tareas"
    fecha: string
    tareas: number[]
  }
  [clave: string]: unknown
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

export const ESTADOS_REUNION = {
  abierta: { label: "Abierta", variant: "default" as const },
  agendada: { label: "Agendada", variant: "secondary" as const },
  cancelada: { label: "Cancelada", variant: "outline" as const },
}

export type EstadoReunion = keyof typeof ESTADOS_REUNION

export const DURACIONES_REUNION = [
  { valor: "30", label: "30 minutos" },
  { valor: "60", label: "1 hora" },
]

// Identificador corto para hablar de una reunión ("REU-7"), igual que ZQ-N e
// IDEA-N.
export function codigoReunion(numero: number): string {
  return `REU-${numero}`
}

// Franja de disponibilidad tal como se guarda: instantes absolutos en ISO.
export type FranjaGuardada = {
  inicio: string
  fin: string
}

export type SolicitudReunion = {
  id: string
  numero: number
  titulo: string
  notas: string | null
  cliente_id: string | null
  proyecto_id: string | null
  duracion_min: number
  ventana_desde: string
  ventana_hasta: string
  socios_requeridos: string[]
  invitar_cliente: boolean
  estado: EstadoReunion
  inicio: string | null
  fin: string | null
  google_event_id: string | null
  google_calendar_id: string | null
  meet_url: string | null
  agendada_por: string | null
  agendada_at: string | null
  metadata: Record<string, unknown>
  created_by: string | null
  created_at: string
  updated_at: string
}

export type RespuestaReunion = {
  id: string
  solicitud_id: string
  socio_id: string
  franjas: FranjaGuardada[]
  comentario: string | null
  created_at: string
  updated_at: string
}

// Qué hizo cada socio requerido con la solicitud. Sale de una sola fuente:
// sin fila de respuesta es "falta"; con franjas vacías es "no_puede".
export type EstadoRespuesta = "respondio" | "no_puede" | "falta"

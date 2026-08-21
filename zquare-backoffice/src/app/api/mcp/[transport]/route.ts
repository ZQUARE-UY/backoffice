import { createMcpHandler, withMcpAuth } from "mcp-handler"
import { z } from "zod"

import {
  etiquetaHueco,
  FORMATO_FECHA,
  FORMATO_HORA,
  paredEnZona,
  sumarDias,
} from "@/lib/disponibilidad"
import { codigoReunion, type SolicitudReunion } from "@/lib/dominio"
import { generarEmbeddings } from "@/lib/embeddings"
import { socioDelAccessToken } from "@/lib/mcp-oauth"
import {
  agendarSiTodosRespondieron,
  agendarSolicitud,
  CAMPOS_SOLICITUD,
  cancelarSolicitud,
  crearSolicitudReunion,
  editarSolicitudReunion,
  guardarRespuestaDe,
  parsearEmails,
  huecosDeSolicitud,
  solicitudesPendientes,
} from "@/lib/reuniones"
import {
  completarSprint,
  iniciarSprint,
  moverTarjetaASprint,
  numeroDeSprint,
  sprintActivo,
  sprintPorNumero,
  ubicacionCoherente,
  type SprintResumen,
  type Ubicacion,
} from "@/lib/sprints"
import { definirCeremonias, planPorDefecto, type PlanCeremonias } from "@/lib/ceremonias"
import { createAdminClient } from "@/lib/supabase/admin"
import { listarGrabaciones } from "@/lib/transcripcion"

// MCP server del backoffice: expone los datos de la empresa a Claude
// (Claude Code / Desktop / claude.ai) vía Streamable HTTP en /api/mcp/mcp.
//
// Auth, dos vías equivalentes:
// - Token estático por socio: MCP_TOKENS = "email:token,..." en Vercel
//   (Claude Code / Desktop, pegando el token a mano).
// - OAuth 2.1 (claude.ai web/celular): tokens emitidos en /oauth/autorizar,
//   guardados hasheados en mcp_oauth_tokens.
// El endpoint usa la service role key de Supabase (el control de acceso es
// el token, no RLS), por eso las escrituras registran created_by del socio.

export const maxDuration = 60

const CARPETA_DECISIONES = "/decisiones"

type ContenidoTexto = { content: [{ type: "text"; text: string }] }

function texto(data: unknown): ContenidoTexto {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 1),
      },
    ],
  }
}

function socioDelToken(bearer: string | undefined): string | null {
  if (!bearer) return null
  const pares = (process.env.MCP_TOKENS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
  for (const par of pares) {
    const [email, token] = par.split(":")
    if (token && token === bearer) return email
  }
  return null
}

async function socioIdPorEmail(email: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("socios")
    .select("id")
    .eq("email", email)
    .maybeSingle()
  return data?.id ?? null
}

const ESTADOS_TAREA = [
  "backlog",
  "por_hacer",
  "en_curso",
  "en_revision",
  "hecho",
] as const
const PRIORIDADES_TAREA = ["baja", "media", "alta", "urgente"] as const
const ESTADOS_IDEA = [
  "semilla",
  "en_exploracion",
  "lista",
  "aprobada",
  "descartada",
] as const

// Las tarjetas se referencian por número ("ZQ-12" o 12): es el identificador
// corto que ven los socios en el tablero.
function numeroDeTarea(referencia: string | number): number | null {
  const n = Number(String(referencia).replace(/^zq-?/i, "").trim())
  return Number.isInteger(n) && n > 0 ? n : null
}

// Las ideas se referencian igual, con su propio prefijo ("IDEA-7" o 7).
function numeroDeIdea(referencia: string | number): number | null {
  const n = Number(String(referencia).replace(/^idea-?/i, "").trim())
  return Number.isInteger(n) && n > 0 ? n : null
}

// Campos del one-pager de una idea, compartidos entre crear/actualizar y el
// snapshot que se guarda en ideas_versiones.
const CAMPOS_IDEA = [
  "titulo",
  "descripcion",
  "problema",
  "competencia",
  "solucion",
  "esfuerzo",
  "impacto",
  "proximos_pasos",
  "estado",
  "etiquetas",
] as const

// Campos del contenido de una tarjeta (brief incluido), compartidos entre
// crear/actualizar y el snapshot que se guarda en tareas_versiones.
const CAMPOS_TAREA = [
  "titulo",
  "descripcion",
  "contexto",
  "resultado",
  "recursos",
  "plan",
  "estado",
  "prioridad",
  "etiquetas",
  "fecha_limite",
  "codigo_proyecto",
  "estimacion",
  "moscow",
  "epica",
] as const

// Brief de desarrollo: si los cuatro están vacíos, la tarjeta está "sin
// desarrollar" y conviene pasarla por el prompt `desarrollar_tarea`.
const CAMPOS_BRIEF = ["contexto", "resultado", "recursos", "plan"] as const

const ESTADOS_PROYECTO = [
  "propuesta",
  "en_curso",
  "entregado",
  "mantenimiento",
  "cancelado",
] as const

const TIPOS_PROYECTO = [
  "desarrollo",
  "integracion",
  "mantenimiento",
  "interno",
] as const

// Brief de arranque de un proyecto (ver BRIEF_PROYECTO en src/lib/dominio.ts).
// Son las nueve preguntas del prompt `comenzar_proyecto`.
const CAMPOS_BRIEF_PROYECTO = [
  "objetivo",
  "alcance",
  "fuera_de_alcance",
  "stakeholders",
  "stack_y_repos",
  "entornos_y_accesos",
  "riesgos",
  "definicion_de_hecho",
  "hitos",
] as const

// Los cuatro que hacen falta para que alguien más agarre el proyecto sin
// preguntar. `comenzar_proyecto` no cierra el arranque sin ellos.
const CAMPOS_BRIEF_PROYECTO_MINIMO = [
  "objetivo",
  "alcance",
  "fuera_de_alcance",
  "stakeholders",
] as const

// Contenido versionado de un proyecto: lo que se guarda en el snapshot de
// proyectos_versiones (el brief más lo que define de qué proyecto se trata).
const CAMPOS_PROYECTO = [
  "nombre",
  "descripcion",
  "estado",
  "tipo",
  ...CAMPOS_BRIEF_PROYECTO,
  "fecha_inicio",
  "fecha_fin_estimada",
  "fecha_fin_real",
  "horas_estimadas",
  "monto_acordado",
  "moneda",
] as const

// Esquema del brief compartido entre `actualizar_proyecto` y
// `comenzar_proyecto`: las descripciones son las preguntas que hay que
// contestar, para que el agente sepa qué va en cada campo sin adivinar.
const ESQUEMA_BRIEF_PROYECTO = {
  objetivo: z
    .string()
    .describe("brief: qué problema del cliente resuelve y cómo sabremos que valió la pena")
    .optional(),
  alcance: z
    .string()
    .describe("brief: qué entra — funcionalidades, entregables, integraciones acordadas")
    .optional(),
  fuera_de_alcance: z
    .string()
    .describe("brief: qué NO entra. Es el campo que evita las discusiones del mes tres")
    .optional(),
  stakeholders: z
    .string()
    .describe("brief: quién decide del lado del cliente, quién valida, quién da accesos y por qué canal")
    .optional(),
  stack_y_repos: z
    .string()
    .describe("brief: tecnologías acordadas, repos y convenciones que aplican")
    .optional(),
  entornos_y_accesos: z
    .string()
    .describe("brief: local/staging/producción, credenciales y accesos a pedir, y a quién")
    .optional(),
  riesgos: z
    .string()
    .describe("brief: qué puede salir mal y qué haríamos — dependencias del cliente, incógnitas técnicas, plazos")
    .optional(),
  definicion_de_hecho: z
    .string()
    .describe("brief: qué tiene que cumplir una tarjeta para estar hecha en ESTE proyecto (tests, review, deploy, aceptación)")
    .optional(),
  hitos: z
    .string()
    .describe("brief: entregas intermedias con fecha; contra qué se mide el avance y qué se factura")
    .optional(),
}

// Resuelve un proyecto por nombre aproximado y devuelve la fila entera. A
// diferencia de `idPorNombre`, avisa cuando el nombre matchea más de uno: con
// proyectos que se llaman parecido entre clientes, elegir el primero en
// silencio es escribirle al proyecto equivocado.
async function proyectoPorNombre(
  nombre: string
): Promise<{ proyecto: Record<string, unknown> | null; error: string | null }> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("proyectos")
    .select("*, clientes(nombre)")
    .is("deleted_at", null)
    .ilike("nombre", `%${nombre.trim()}%`)
    .limit(5)
  if (!data || data.length === 0) {
    return { proyecto: null, error: `No encontré un proyecto que matchee "${nombre}".` }
  }
  if (data.length > 1) {
    const opciones = data
      .map((p) => `${p.nombre}${p.clientes?.nombre ? ` (${p.clientes.nombre})` : " (interno)"}`)
      .join(", ")
    return {
      proyecto: null,
      error: `"${nombre}" matchea varios proyectos: ${opciones}. Precisá el nombre.`,
    }
  }
  return { proyecto: data[0], error: null }
}

// Planificación: los campos que exige el estándar de ingeniería para poder
// armar un sprint. Sólo aplican a proyectos que lo siguen; una tarea de
// empresa los deja en null. Compartidos entre crear_tarea y actualizar_tarea.
const CAMPOS_PLANIFICACION = ["codigo_proyecto", "estimacion", "moscow", "epica"] as const

const PUNTOS_FIBONACCI = [1, 2, 3, 5, 8, 13]

const ESQUEMA_PLANIFICACION = {
  codigo_proyecto: z
    .string()
    .regex(
      /^(US|DEF|SC|TEC)-\d+$/i,
      "formato esperado: US-014, DEF-07, SC-3 o TEC-2"
    )
    .describe(
      "código de la tarjeta DENTRO de su proyecto (US-014, DEF-07). Distinto del ZQ-N, que es de la empresa: éste es el que enlaza con el requisito y el que usa la convención de ramas"
    )
    .optional(),
  estimacion: z
    // `coerce` por la misma razón que `tarea` acepta string|number: hay
    // clientes MCP que serializan todo escalar como texto, y un "5" que
    // rebota deja el campo inutilizable desde ese cliente.
    .coerce.number()
    .int()
    .refine((n) => PUNTOS_FIBONACCI.includes(n), "puntos válidos: 1, 2, 3, 5, 8, 13")
    .describe(
      "puntos de historia en Fibonacci. La estima el equipo por consenso, no un agente: no la completes por tu cuenta"
    )
    .optional(),
  moscow: z
    .enum(["must", "should", "could", "wont"])
    .describe("alcance del release. No es lo mismo que `prioridad`, que es urgencia")
    .optional(),
  epica: z
    .string()
    .regex(/^EP-\d+$/i, "formato esperado: EP-3")
    .describe("épica a la que pertenece; una tarjeta no puede pertenecer a dos")
    .optional(),
}

// Los códigos se guardan en mayúsculas: "us-14" y "US-14" son el mismo código
// y no pueden convivir como dos.
function normalizarPlanificacion<T extends Record<string, unknown>>(entrada: T) {
  const salida: Record<string, unknown> = {}
  for (const campo of ["codigo_proyecto", "epica"] as const) {
    if (typeof entrada[campo] === "string") {
      salida[campo] = (entrada[campo] as string).toUpperCase()
    }
  }
  return salida
}

// Quién opera vía MCP: socio dueño del token, con la marca "(Claude)" para
// atribuir versiones y comentarios (mismo criterio que comentar_tarea).
async function actorMcp(
  extra: { authInfo?: { extra?: Record<string, unknown> } }
): Promise<{ socioId: string | null; autor: string }> {
  const email = extra.authInfo?.extra?.email as string | undefined
  const socioId = email ? await socioIdPorEmail(email) : null
  const supabase = createAdminClient()
  const { data: socio } = socioId
    ? await supabase.from("socios").select("nombre").eq("id", socioId).maybeSingle()
    : { data: null }
  return { socioId, autor: `${socio?.nombre ?? email ?? "Agente"} (Claude)` }
}

// Resuelve un sprint por referencia ("3", "Sprint 3"). Devuelve undefined si
// no se pidió, null si no existe (con el mensaje para el agente).
async function sprintPorReferencia(
  referencia: string | number | undefined
): Promise<SprintResumen | null | undefined> {
  if (referencia === undefined) return undefined
  const numero = numeroDeSprint(referencia)
  if (!numero) return null
  return sprintPorNumero(createAdminClient(), numero)
}

// Una tarjeta movida o creada por un agente entra arriba de su columna, donde
// se ve sin scrollear. `orden` es numeric a propósito (ver la migración).
async function ordenAlTopeDeColumna(estado: string): Promise<number> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("tareas")
    .select("orden")
    .eq("estado", estado)
    .is("deleted_at", null)
    .order("orden", { ascending: true })
    .limit(1)
    .maybeSingle()
  return Number(data?.orden ?? 0) - 1
}

// Resuelve un cliente/proyecto/socio por nombre aproximado. Devuelve undefined
// si no hay que tocar el campo, o null si se pidió pero no existe.
async function idPorNombre(
  tabla: "clientes" | "proyectos",
  nombre: string | undefined
): Promise<string | null | undefined> {
  if (nombre === undefined) return undefined
  if (nombre === "") return null
  const supabase = createAdminClient()
  const { data } = await supabase
    .from(tabla)
    .select("id")
    .is("deleted_at", null)
    .ilike("nombre", `%${nombre.trim()}%`)
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

// Las reuniones se referencian por su código corto ("REU-7" o 7).
function numeroDeReunion(referencia: string | number): number | null {
  const n = Number(String(referencia).replace(/^reu-?/i, "").trim())
  return Number.isInteger(n) && n > 0 ? n : null
}

async function solicitudPorReferencia(
  referencia: string | number,
  supabase: ReturnType<typeof createAdminClient>
): Promise<SolicitudReunion | null> {
  const numero = numeroDeReunion(referencia)
  if (!numero) return null
  const { data } = await supabase
    .from("solicitudes_reunion")
    .select(CAMPOS_SOLICITUD)
    .eq("numero", numero)
    .is("deleted_at", null)
    .maybeSingle()
  return (data as SolicitudReunion | null) ?? null
}

// Resuelve los socios de una reunión por nombre o email. Sin lista, van todos:
// es el caso normal en una empresa de cuatro.
async function sociosRequeridosMcp(
  referencias: string[] | undefined
): Promise<{ id: string; nombre: string }[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("socios")
    .select("id, nombre, email")
    .is("deleted_at", null)
  const socios = (data ?? []) as { id: string; nombre: string; email: string }[]

  if (!referencias || referencias.length === 0) return socios

  const elegidos = referencias
    .map((ref) => {
      const buscado = ref.trim().toLowerCase()
      return socios.find(
        (s) =>
          s.email.toLowerCase() === buscado ||
          s.nombre.toLowerCase().includes(buscado)
      )
    })
    .filter((s): s is { id: string; nombre: string; email: string } => Boolean(s))

  // Sin duplicados si dos referencias apuntan al mismo socio.
  return [...new Map(elegidos.map((s) => [s.id, s])).values()]
}

// Embedding de la consulta (Workers AI bge-m3). Null si falla: la búsqueda
// literal sigue funcionando sin la parte semántica.
async function embeddingConsulta(consulta: string): Promise<number[] | null> {
  try {
    const [embedding] = await generarEmbeddings([consulta])
    return embedding ?? null
  } catch {
    return null
  }
}

const handler = createMcpHandler(
  (server) => {
    // ── Lectura ───────────────────────────────────────────────────────────
    server.registerTool(
      "buscar",
      {
        title: "Buscar en el backoffice",
        description:
          "Busca clientes, proyectos, documentos, tarjetas del tablero e ideas por nombre (literal) y contenido de documentos de Drive, decisiones e ideas (semántico, multilingüe).",
        inputSchema: { consulta: z.string().min(2) },
      },
      async ({ consulta }) => {
        const supabase = createAdminClient()
        const like = `%${consulta.replace(/[(),*%_]/g, " ").trim()}%`
        const [clientes, proyectos, documentos, tareas, ideas] = await Promise.all([
          supabase
            .from("clientes")
            .select("id, nombre, estado")
            .is("deleted_at", null)
            .ilike("nombre", like)
            .limit(5),
          supabase
            .from("proyectos")
            .select("id, nombre, estado, clientes(nombre)")
            .is("deleted_at", null)
            .ilike("nombre", like)
            .limit(5),
          supabase
            .from("documentos")
            .select("titulo, tipo, drive_url, clientes(nombre)")
            .is("deleted_at", null)
            .ilike("titulo", like)
            .limit(5),
          supabase
            .from("tareas")
            .select("numero, titulo, estado, prioridad")
            .is("deleted_at", null)
            .ilike("titulo", like)
            .limit(5),
          supabase
            .from("ideas")
            .select("numero, titulo, estado")
            .is("deleted_at", null)
            .ilike("titulo", like)
            .limit(5),
        ])

        let contenido: unknown[] = []
        const embedding = await embeddingConsulta(consulta)
        if (embedding) {
          const { data } = await supabase.rpc("buscar_fragmentos", {
            consulta: JSON.stringify(embedding),
            cantidad: 6,
          })
          contenido = (data ?? []).map(
            (f: { titulo: string; url: string; fragmento: string; similitud: number }) => ({
              titulo: f.titulo,
              url: f.url,
              extracto: f.fragmento.slice(0, 200),
              similitud: Number(f.similitud.toFixed(3)),
            })
          )
        }

        return texto({
          clientes: clientes.data ?? [],
          proyectos: proyectos.data ?? [],
          documentos: documentos.data ?? [],
          tareas: (tareas.data ?? []).map(({ numero, ...t }) => ({
            codigo: `ZQ-${numero}`,
            ...t,
          })),
          ideas: (ideas.data ?? []).map(({ numero, ...i }) => ({
            codigo: `IDEA-${numero}`,
            ...i,
          })),
          contenido_semantico: contenido,
        })
      }
    )

    server.registerTool(
      "listar_clientes",
      {
        title: "Listar clientes",
        description:
          "Lista todos los clientes con su estado, notas y proyectos.",
        inputSchema: {},
      },
      async () => {
        const supabase = createAdminClient()
        const { data, error } = await supabase
          .from("clientes")
          .select("id, nombre, empresa, estado, notas, proyectos(nombre, estado)")
          .is("deleted_at", null)
          .order("nombre")
        if (error) throw new Error(error.message)
        return texto(data)
      }
    )

    server.registerTool(
      "ficha_cliente",
      {
        title: "Ficha de un cliente",
        description:
          "Devuelve la ficha completa de un cliente (por nombre, no hace falta exacto): proyectos, presupuestos, documentos, decisiones, movimientos y tarjetas del tablero asociadas.",
        inputSchema: { nombre: z.string().min(2) },
      },
      async ({ nombre }) => {
        const supabase = createAdminClient()
        const { data: cliente } = await supabase
          .from("clientes")
          .select("*")
          .is("deleted_at", null)
          .ilike("nombre", `%${nombre.trim()}%`)
          .limit(1)
          .maybeSingle()
        if (!cliente) return texto(`No encontré un cliente que matchee "${nombre}".`)

        const [proyectos, presupuestos, documentos, decisiones, movimientos, tareas] =
          await Promise.all([
            supabase
              .from("proyectos")
              .select("id, nombre, descripcion, estado, fecha_inicio")
              .eq("cliente_id", cliente.id)
              .is("deleted_at", null),
            supabase
              .from("presupuestos")
              .select("id, version, moneda, monto_total, estado, fecha_envio, proyectos(nombre)")
              .is("deleted_at", null)
              .in(
                "proyecto_id",
                (
                  await supabase
                    .from("proyectos")
                    .select("id")
                    .eq("cliente_id", cliente.id)
                ).data?.map((p) => p.id) ?? []
              ),
            supabase
              .from("documentos")
              .select("titulo, tipo, drive_url, fecha")
              .eq("cliente_id", cliente.id)
              .is("deleted_at", null),
            supabase
              .from("decisiones")
              .select("fecha, titulo, detalle, participantes")
              .eq("cliente_id", cliente.id)
              .is("deleted_at", null),
            supabase
              .from("movimientos")
              .select("tipo, fecha, moneda, monto, monto_usd, categoria, descripcion")
              .eq("cliente_id", cliente.id)
              .is("deleted_at", null),
            supabase
              .from("tareas")
              .select("numero, titulo, estado, prioridad, fecha_limite")
              .eq("cliente_id", cliente.id)
              .is("deleted_at", null)
              .order("orden"),
          ])

        return texto({
          cliente,
          proyectos: proyectos.data ?? [],
          presupuestos: presupuestos.data ?? [],
          documentos: documentos.data ?? [],
          decisiones: decisiones.data ?? [],
          movimientos: movimientos.data ?? [],
          tareas: (tareas.data ?? []).map(({ numero, ...t }) => ({
            codigo: `ZQ-${numero}`,
            ...t,
          })),
        })
      }
    )

    server.registerTool(
      "resumen_finanzas",
      {
        title: "Resumen de finanzas",
        description:
          "Totales de ingresos/gastos/aportes/retiros en USD (histórico y mes actual) y balance entre socios.",
        inputSchema: {},
      },
      async () => {
        const supabase = createAdminClient()
        const [{ data: movimientos }, { data: balance }] = await Promise.all([
          supabase
            .from("movimientos")
            .select("tipo, fecha, monto_usd")
            .is("deleted_at", null),
          supabase.from("balance_socios").select("*"),
        ])

        const inicioMes = new Date()
        inicioMes.setDate(1)
        const mesActual = inicioMes.toISOString().slice(0, 10)

        const totales: Record<string, { historico: number; mes_actual: number }> = {}
        for (const m of movimientos ?? []) {
          const t = (totales[m.tipo] ??= { historico: 0, mes_actual: 0 })
          t.historico += Number(m.monto_usd)
          if (m.fecha >= mesActual) t.mes_actual += Number(m.monto_usd)
        }
        const resultado =
          (totales.ingreso?.historico ?? 0) - (totales.gasto?.historico ?? 0)

        return texto({
          totales_usd: totales,
          resultado_historico_usd: Number(resultado.toFixed(2)),
          balance_socios: balance ?? [],
        })
      }
    )

    server.registerTool(
      "listar_movimientos",
      {
        title: "Listar movimientos",
        description: "Movimientos financieros, opcionalmente filtrados por tipo o rango de fechas.",
        inputSchema: {
          tipo: z.enum(["ingreso", "gasto", "aporte_socio", "retiro_socio"]).optional(),
          desde: z.string().describe("fecha YYYY-MM-DD").optional(),
          hasta: z.string().describe("fecha YYYY-MM-DD").optional(),
          limite: z.number().int().min(1).max(200).optional(),
        },
      },
      async ({ tipo, desde, hasta, limite }) => {
        const supabase = createAdminClient()
        let q = supabase
          .from("movimientos")
          .select(
            "fecha, tipo, moneda, monto, tc_a_usd, monto_usd, categoria, descripcion, socios(nombre), clientes(nombre)"
          )
          .is("deleted_at", null)
          .order("fecha", { ascending: false })
          .limit(limite ?? 50)
        if (tipo) q = q.eq("tipo", tipo)
        if (desde) q = q.gte("fecha", desde)
        if (hasta) q = q.lte("fecha", hasta)
        const { data, error } = await q
        if (error) throw new Error(error.message)
        return texto(data)
      }
    )

    server.registerTool(
      "listar_decisiones",
      {
        title: "Listar decisiones",
        description: "Bitácora de decisiones de la empresa, de la más reciente a la más vieja.",
        inputSchema: { limite: z.number().int().min(1).max(100).optional() },
      },
      async ({ limite }) => {
        const supabase = createAdminClient()
        const { data, error } = await supabase
          .from("decisiones")
          .select("fecha, titulo, detalle, participantes, clientes(nombre)")
          .is("deleted_at", null)
          .order("fecha", { ascending: false })
          .limit(limite ?? 30)
        if (error) throw new Error(error.message)
        return texto(data)
      }
    )

    // ── Proyectos ─────────────────────────────────────────────────────────
    // El proyecto es la unidad de trabajo: acá vive el brief de arranque que
    // contesta las preguntas que hay que tener resueltas antes de escribir la
    // primera línea de código. El arranque estandarizado se hace con el prompt
    // `comenzar_proyecto`, que usa estas tools.
    server.registerTool(
      "listar_proyectos",
      {
        title: "Listar proyectos",
        description:
          "Proyectos de la empresa con su estado, cliente, responsable y estado de arranque. `comenzado` en false significa que todavía no se corrió el arranque estandarizado (prompt `comenzar_proyecto`): puede estar vendido y hasta en curso, pero sin brief, sin tareas y sin accesos definidos. Sin filtros omite los proyectos entregados y cancelados.",
        inputSchema: {
          estado: z.enum(ESTADOS_PROYECTO).optional(),
          tipo: z.enum(TIPOS_PROYECTO).optional(),
          cliente_nombre: z
            .string()
            .describe("nombre aproximado del cliente")
            .optional(),
          responsable_email: z
            .string()
            .describe("socio a cargo")
            .optional(),
          sin_comenzar: z
            .boolean()
            .describe("true = solo los que todavía no arrancaron")
            .optional(),
          incluir_cerrados: z
            .boolean()
            .describe("true = incluye entregados y cancelados")
            .optional(),
        },
      },
      async (entrada) => {
        const supabase = createAdminClient()
        let q = supabase
          .from("proyectos")
          .select(
            "nombre, descripcion, estado, tipo, fecha_inicio, fecha_fin_estimada, fecha_fin_real, horas_estimadas, horas_reales, monto_acordado, moneda, kickoff_completado_at, kickoff_por, objetivo, clientes(nombre), responsable:socios!proyectos_responsable_id_fkey(nombre, email)"
          )
          .is("deleted_at", null)
          .order("fecha_fin_estimada", { nullsFirst: false })

        if (entrada.estado) q = q.eq("estado", entrada.estado)
        else if (!entrada.incluir_cerrados)
          q = q.not("estado", "in", "(entregado,cancelado)")
        if (entrada.tipo) q = q.eq("tipo", entrada.tipo)
        if (entrada.sin_comenzar) q = q.is("kickoff_completado_at", null)

        if (entrada.cliente_nombre) {
          const clienteId = await idPorNombre("clientes", entrada.cliente_nombre)
          if (!clienteId)
            return texto(`No encontré el cliente "${entrada.cliente_nombre}".`)
          q = q.eq("cliente_id", clienteId)
        }
        if (entrada.responsable_email) {
          const socioId = await socioIdPorEmail(entrada.responsable_email)
          if (!socioId)
            return texto(`No encontré un socio con email ${entrada.responsable_email}.`)
          q = q.eq("responsable_id", socioId)
        }

        const { data, error } = await q
        if (error) throw new Error(error.message)

        return texto(
          (data ?? []).map(({ kickoff_completado_at, ...p }) => ({
            ...p,
            comenzado: Boolean(kickoff_completado_at),
            kickoff_completado_at,
          }))
        )
      }
    )

    server.registerTool(
      "ficha_proyecto",
      {
        title: "Ficha de un proyecto",
        description:
          "Todo lo que el backoffice sabe de un proyecto (por nombre, no hace falta exacto): su brief de arranque, cliente, presupuestos, documentos, decisiones, tarjetas del tablero e idea de origen si salió del banco. Es lo primero que hay que leer antes de arrancarlo o de preguntarle algo a un socio: casi todo lo que uno preguntaría ya está acá. `campos_brief_faltantes` dice qué queda por definir.",
        inputSchema: { nombre: z.string().min(2) },
      },
      async ({ nombre }) => {
        const { proyecto, error: noEncontrado } = await proyectoPorNombre(nombre)
        if (!proyecto) return texto(noEncontrado)

        const supabase = createAdminClient()
        const id = proyecto.id as string
        const clienteId = proyecto.cliente_id as string | null

        const [presupuestos, documentos, decisiones, tareas, idea, responsable] =
          await Promise.all([
            supabase
              .from("presupuestos")
              .select("version, moneda, monto_total, estado, fecha_envio")
              .eq("proyecto_id", id)
              .is("deleted_at", null),
            supabase
              .from("documentos")
              .select("titulo, tipo, drive_url, fecha")
              .eq("proyecto_id", id)
              .is("deleted_at", null),
            supabase
              .from("decisiones")
              .select("fecha, titulo, detalle, participantes")
              .eq("proyecto_id", id)
              .is("deleted_at", null),
            supabase
              .from("tareas")
              .select(
                "numero, titulo, estado, prioridad, codigo_proyecto, epica, estimacion, moscow, fecha_limite"
              )
              .eq("proyecto_id", id)
              .is("deleted_at", null)
              .order("orden"),
            supabase
              .from("ideas")
              .select("numero, titulo, estado")
              .eq("proyecto_id", id)
              .is("deleted_at", null)
              .maybeSingle(),
            proyecto.responsable_id
              ? supabase
                  .from("socios")
                  .select("nombre, email")
                  .eq("id", proyecto.responsable_id)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
          ])

        const brief: Record<string, unknown> = {}
        for (const campo of CAMPOS_BRIEF_PROYECTO) brief[campo] = proyecto[campo]
        const faltantes = CAMPOS_BRIEF_PROYECTO.filter((campo) => !proyecto[campo])

        // Precondiciones del arranque: lo que conviene tener resuelto antes de
        // comenzar. No bloquean, pero el prompt las avisa en vez de arrancar a
        // ciegas.
        const presupuestoAprobado = (presupuestos.data ?? []).some(
          (p) => p.estado === "aprobado"
        )

        return texto({
          proyecto: {
            nombre: proyecto.nombre,
            descripcion: proyecto.descripcion,
            estado: proyecto.estado,
            tipo: proyecto.tipo,
            cliente: (proyecto.clientes as { nombre: string } | null)?.nombre ?? null,
            interno: clienteId === null,
            responsable: responsable.data?.nombre ?? null,
            responsable_email: responsable.data?.email ?? null,
            fecha_inicio: proyecto.fecha_inicio,
            fecha_fin_estimada: proyecto.fecha_fin_estimada,
            fecha_fin_real: proyecto.fecha_fin_real,
            horas_estimadas: proyecto.horas_estimadas,
            horas_reales: proyecto.horas_reales,
            monto_acordado: proyecto.monto_acordado,
            moneda: proyecto.moneda,
            comenzado: Boolean(proyecto.kickoff_completado_at),
            kickoff_completado_at: proyecto.kickoff_completado_at,
            kickoff_por: proyecto.kickoff_por,
          },
          brief,
          campos_brief_faltantes: faltantes,
          precondiciones: {
            presupuesto_aprobado: presupuestoAprobado,
            tiene_responsable: Boolean(proyecto.responsable_id),
            tiene_tipo: Boolean(proyecto.tipo),
            tiene_fecha_inicio: Boolean(proyecto.fecha_inicio),
            tiene_monto_acordado: proyecto.monto_acordado != null,
          },
          presupuestos: presupuestos.data ?? [],
          documentos: documentos.data ?? [],
          decisiones: decisiones.data ?? [],
          tareas: (tareas.data ?? []).map(({ numero, ...t }) => ({
            codigo: `ZQ-${numero}`,
            ...t,
          })),
          idea_de_origen: idea.data
            ? { codigo: `IDEA-${idea.data.numero}`, titulo: idea.data.titulo }
            : null,
        })
      }
    )

    server.registerTool(
      "actualizar_proyecto",
      {
        title: "Actualizar un proyecto",
        description:
          "Cambia campos de un proyecto existente, incluido su brief de arranque. Solo se tocan los campos que se pasan; string vacío limpia el campo. Cada edición queda en el historial de versiones. Para cerrar el arranque completo usá `comenzar_proyecto`, que además marca el kickoff.",
        inputSchema: {
          proyecto: z.string().min(2).describe("nombre del proyecto, no hace falta exacto"),
          nombre: z.string().min(3).describe("nombre nuevo, para renombrarlo").optional(),
          descripcion: z.string().optional(),
          estado: z.enum(ESTADOS_PROYECTO).optional(),
          tipo: z
            .enum(TIPOS_PROYECTO)
            .describe("clase de trabajo; decide las tareas de setup del arranque")
            .optional(),
          responsable_email: z
            .string()
            .describe("socio a cargo; string vacío lo deja sin responsable")
            .optional(),
          fecha_inicio: z.string().describe("YYYY-MM-DD").optional(),
          fecha_fin_estimada: z.string().describe("YYYY-MM-DD").optional(),
          fecha_fin_real: z.string().describe("YYYY-MM-DD").optional(),
          horas_estimadas: z.coerce.number().optional(),
          horas_reales: z.coerce.number().optional(),
          ...ESQUEMA_BRIEF_PROYECTO,
        },
      },
      async (entrada, extra) => {
        const { proyecto: actual, error: noEncontrado } = await proyectoPorNombre(
          entrada.proyecto
        )
        if (!actual) return texto(noEncontrado)

        const cambios: Record<string, unknown> = {}
        if (entrada.nombre !== undefined) cambios.nombre = entrada.nombre
        if (entrada.descripcion !== undefined)
          cambios.descripcion = entrada.descripcion || null
        if (entrada.estado !== undefined) cambios.estado = entrada.estado
        if (entrada.tipo !== undefined) cambios.tipo = entrada.tipo
        for (const campo of CAMPOS_BRIEF_PROYECTO) {
          if (entrada[campo] !== undefined) cambios[campo] = entrada[campo] || null
        }
        for (const campo of [
          "fecha_inicio",
          "fecha_fin_estimada",
          "fecha_fin_real",
        ] as const) {
          if (entrada[campo] !== undefined) cambios[campo] = entrada[campo] || null
        }
        for (const campo of ["horas_estimadas", "horas_reales"] as const) {
          if (entrada[campo] !== undefined) cambios[campo] = entrada[campo]
        }
        if (entrada.responsable_email !== undefined) {
          if (entrada.responsable_email === "") cambios.responsable_id = null
          else {
            const socioId = await socioIdPorEmail(entrada.responsable_email)
            if (!socioId)
              return texto(`No encontré un socio con email ${entrada.responsable_email}.`)
            cambios.responsable_id = socioId
          }
        }

        if (Object.keys(cambios).length === 0) {
          return texto(`No pasaste ningún cambio para "${actual.nombre}".`)
        }

        const supabase = createAdminClient()
        const { data, error } = await supabase
          .from("proyectos")
          .update(cambios)
          .eq("id", actual.id)
          .select("*")
          .single()
        if (error) throw new Error(error.message)

        // Snapshot completo post-edición (no un delta), atribuido al agente.
        const { autor, socioId } = await actorMcp(extra)
        const snapshot: Record<string, unknown> = {}
        for (const campo of CAMPOS_PROYECTO) snapshot[campo] = data[campo]
        await supabase.from("proyectos_versiones").insert({
          proyecto_id: actual.id as string,
          snapshot,
          autor,
          autor_socio_id: socioId,
        })

        const faltantes = CAMPOS_BRIEF_PROYECTO.filter((campo) => !data[campo])
        return texto({
          actualizado: {
            nombre: data.nombre,
            estado: data.estado,
            tipo: data.tipo,
          },
          campos_brief_faltantes: faltantes,
        })
      }
    )

    server.registerTool(
      "comenzar_proyecto",
      {
        title: "Marcar el arranque de un proyecto",
        description:
          "Cierra el arranque estandarizado: guarda lo que falte del brief, pasa el proyecto a 'en_curso', fija la fecha de inicio y deja registrado quién y cuándo lo arrancó. Es el último paso del prompt `comenzar_proyecto`, después de haber creado las tareas iniciales y registrado las decisiones. No cierra el arranque si falta alguno de los cuatro campos mínimos del brief (objetivo, alcance, fuera_de_alcance, stakeholders): sin eso el proyecto no queda listo para que otro lo agarre.",
        inputSchema: {
          proyecto: z.string().min(2).describe("nombre del proyecto, no hace falta exacto"),
          tipo: z
            .enum(TIPOS_PROYECTO)
            .describe("clase de trabajo; obligatorio si el proyecto todavía no lo tiene")
            .optional(),
          responsable_email: z
            .string()
            .describe("socio a cargo; obligatorio si el proyecto todavía no lo tiene")
            .optional(),
          fecha_inicio: z
            .string()
            .describe("YYYY-MM-DD; default hoy")
            .optional(),
          fecha_fin_estimada: z.string().describe("YYYY-MM-DD").optional(),
          ...ESQUEMA_BRIEF_PROYECTO,
        },
      },
      async (entrada, extra) => {
        const { proyecto: actual, error: noEncontrado } = await proyectoPorNombre(
          entrada.proyecto
        )
        if (!actual) return texto(noEncontrado)

        if (actual.kickoff_completado_at) {
          return texto(
            `"${actual.nombre}" ya fue arrancado el ${String(actual.kickoff_completado_at).slice(0, 10)} por ${actual.kickoff_por ?? "alguien"}; no hice nada. Para corregir el brief usá \`actualizar_proyecto\`.`
          )
        }

        // El brief resultante es el que ya estaba más lo que llega ahora.
        const brief: Record<string, string | null> = {}
        for (const campo of CAMPOS_BRIEF_PROYECTO) {
          const nuevo = entrada[campo]
          brief[campo] =
            nuevo !== undefined
              ? nuevo || null
              : ((actual[campo] as string | null) ?? null)
        }

        const faltantes = CAMPOS_BRIEF_PROYECTO_MINIMO.filter((campo) => !brief[campo])
        if (faltantes.length > 0) {
          return texto(
            `No cerré el arranque de "${actual.nombre}": falta definir ${faltantes.join(", ")}. Son los campos que hacen que otro pueda agarrar el proyecto sin preguntar. Completalos y volvé a intentar.`
          )
        }

        const tipo = entrada.tipo ?? (actual.tipo as string | null)
        if (!tipo) {
          return texto(
            `No cerré el arranque de "${actual.nombre}": falta el tipo de proyecto (desarrollo, integracion, mantenimiento o interno). Es lo que decide qué tareas de setup corresponden.`
          )
        }

        let responsableId = actual.responsable_id as string | null
        if (entrada.responsable_email) {
          responsableId = await socioIdPorEmail(entrada.responsable_email)
          if (!responsableId)
            return texto(`No encontré un socio con email ${entrada.responsable_email}.`)
        }
        if (!responsableId) {
          return texto(
            `No cerré el arranque de "${actual.nombre}": falta el socio responsable. Pasá \`responsable_email\`.`
          )
        }

        const { autor, socioId } = await actorMcp(extra)
        const ahora = new Date()
        const supabase = createAdminClient()

        const { data, error } = await supabase
          .from("proyectos")
          .update({
            ...brief,
            tipo,
            responsable_id: responsableId,
            estado: "en_curso",
            fecha_inicio:
              entrada.fecha_inicio ??
              (actual.fecha_inicio as string | null) ??
              ahora.toISOString().slice(0, 10),
            ...(entrada.fecha_fin_estimada
              ? { fecha_fin_estimada: entrada.fecha_fin_estimada }
              : {}),
            kickoff_completado_at: ahora.toISOString(),
            kickoff_por: autor,
          })
          .eq("id", actual.id)
          .select("*")
          .single()
        if (error) throw new Error(error.message)

        const snapshot: Record<string, unknown> = {}
        for (const campo of CAMPOS_PROYECTO) snapshot[campo] = data[campo]
        await supabase.from("proyectos_versiones").insert({
          proyecto_id: actual.id as string,
          snapshot,
          autor,
          autor_socio_id: socioId,
        })

        const { count } = await supabase
          .from("tareas")
          .select("id", { count: "exact", head: true })
          .eq("proyecto_id", actual.id)
          .is("deleted_at", null)

        return texto({
          comenzado: data.nombre,
          estado: data.estado,
          tipo: data.tipo,
          fecha_inicio: data.fecha_inicio,
          por: autor,
          tareas_del_proyecto: count ?? 0,
          campos_brief_pendientes: CAMPOS_BRIEF_PROYECTO.filter((c) => !data[c]),
          ver: "/proyectos",
        })
      }
    )

    // ── Tablero de tareas ─────────────────────────────────────────────────
    // A diferencia del resto, acá sí hay ediciones: el tablero está pensado
    // para que un agente lo opere (crear, mover, comentar). El borrado sigue
    // siendo solo de la UI.
    server.registerTool(
      "listar_tareas",
      {
        title: "Listar tareas del tablero",
        description:
          "Tarjetas del tablero de la empresa, agrupadas por columna. 'backlog' es la lista priorizada fuera del tablero (ideas sin comprometer); el tablero va de 'por_hacer' a 'hecho'. Por defecto omite las que están en 'hecho'. `desarrollada` indica si la tarjeta tiene definido su resultado esperado, que es lo que la vuelve resoluble: las que no (típicamente las recién creadas o las que salen de graduar una idea, que traen contexto pero no criterios) necesitan una pasada por el prompt `desarrollar_tarea` antes de que un agente las resuelva. El brief completo se ve con `ficha_tarea`. Cada tarjeta trae su `sprint` (número y nombre, o null): las del sprint activo son el tablero de este ciclo; las de sprints planificados están en 'backlog' esperando que se inicie. Filtrá con `sprint` (número, o 'activo') para ver un sprint completo, y con `sin_sprint` para el backlog libre. Para planificar, filtrá por proyecto: cada tarjeta trae `codigo_proyecto`, `estimacion`, `moscow` y `epica`; las que vengan con `estimacion` en null no pueden entrar a un sprint hasta que el equipo las estime.",
        inputSchema: {
          estado: z.enum(ESTADOS_TAREA).optional(),
          asignado_email: z.string().optional(),
          cliente_nombre: z.string().optional(),
          proyecto_nombre: z.string().optional(),
          sprint: z
            .union([z.string(), z.number()])
            .describe("número del sprint (3, 'Sprint 3') o 'activo'")
            .optional(),
          sin_sprint: z.boolean().describe("solo tarjetas sin sprint").optional(),
          incluir_hechas: z.boolean().optional(),
          limite: z.number().int().min(1).max(200).optional(),
        },
      },
      async ({
        estado,
        asignado_email,
        cliente_nombre,
        proyecto_nombre,
        sprint,
        sin_sprint,
        incluir_hechas,
        limite,
      }) => {
        const supabase = createAdminClient()
        let q = supabase
          .from("tareas")
          .select(
            // `tareas` tiene dos FK a socios (asignado_a y created_by): sin el
            // hint del constraint, PostgREST no sabe cuál embeber.
            "numero, titulo, descripcion, contexto, resultado, recursos, plan, estado, prioridad, codigo_proyecto, estimacion, moscow, epica, etiquetas, fecha_limite, orden, asignado:socios!tareas_asignado_a_fkey(nombre, email), clientes(nombre), proyectos(nombre), sprints(numero, nombre, estado)"
          )
          .is("deleted_at", null)
          .order("estado")
          .order("orden")
          .limit(limite ?? 100)

        if (estado) q = q.eq("estado", estado)
        else if (!incluir_hechas) q = q.neq("estado", "hecho")

        if (sprint !== undefined) {
          const s =
            String(sprint).trim().toLowerCase() === "activo"
              ? await sprintActivo(supabase)
              : await sprintPorReferencia(sprint)
          if (!s) return texto(`No encontré el sprint "${sprint}".`)
          q = q.eq("sprint_id", s.id)
          // Un sprint completo incluye lo hecho (es su resumen).
          if (!estado) q = q.in("estado", [...ESTADOS_TAREA])
        } else if (sin_sprint) {
          q = q.is("sprint_id", null)
        }

        if (asignado_email) {
          const socioId = await socioIdPorEmail(asignado_email)
          if (!socioId) return texto(`No encontré un socio con email ${asignado_email}.`)
          q = q.eq("asignado_a", socioId)
        }
        if (cliente_nombre) {
          const clienteId = await idPorNombre("clientes", cliente_nombre)
          if (!clienteId) return texto(`No encontré el cliente "${cliente_nombre}".`)
          q = q.eq("cliente_id", clienteId)
        }
        if (proyecto_nombre) {
          const proyectoId = await idPorNombre("proyectos", proyecto_nombre)
          if (!proyectoId) return texto(`No encontré el proyecto "${proyecto_nombre}".`)
          q = q.eq("proyecto_id", proyectoId)
        }

        const { data, error } = await q
        if (error) throw new Error(error.message)

        const porColumna: Record<string, unknown[]> = {}
        for (const t of data ?? []) {
          // El texto del brief se descarta (inflaría la respuesta): queda el
          // flag `desarrollada`; el contenido se pide con ficha_tarea.
          const { numero, orden, contexto, resultado, recursos, plan, sprints, ...resto } = t
          void orden
          void contexto
          void recursos
          void plan
          // Desarrollada = tiene `resultado`. Tener contexto no alcanza: es el
          // resultado lo que la vuelve verificable (ver dominio.ts).
          const desarrollada = Boolean(resultado)
          const sprintDe = sprints as unknown as
            | { numero: number; nombre: string; estado: string }
            | null
          ;(porColumna[t.estado] ??= []).push({
            codigo: `ZQ-${numero}`,
            desarrollada,
            ...resto,
            sprint: sprintDe
              ? { numero: sprintDe.numero, nombre: sprintDe.nombre, estado: sprintDe.estado }
              : null,
          })
        }
        return texto({ columnas: porColumna })
      }
    )

    server.registerTool(
      "ficha_tarea",
      {
        title: "Ficha de una tarjeta",
        description:
          "Detalle completo de una tarjeta, con su brief de desarrollo (contexto / resultado / recursos / plan), comentarios e historial de versiones. Se identifica por número o código (12 o ZQ-12). Para resolver una tarjeta: seguí su `plan` y verificá lo hecho contra `resultado` antes de darla por terminada. Si le falta `resultado` no hay contra qué verificar —aunque tenga contexto— así que conviene desarrollarla primero (prompt `desarrollar_tarea`).",
        inputSchema: { tarea: z.union([z.string(), z.number()]) },
      },
      async ({ tarea }) => {
        const numero = numeroDeTarea(tarea)
        if (!numero) return texto(`"${tarea}" no parece un número de tarjeta (ej. ZQ-12).`)

        const supabase = createAdminClient()
        const { data } = await supabase
          .from("tareas")
          .select(
            "id, numero, titulo, descripcion, contexto, resultado, recursos, plan, estado, prioridad, codigo_proyecto, estimacion, moscow, epica, etiquetas, fecha_limite, created_at, updated_at, asignado:socios!tareas_asignado_a_fkey(nombre, email), clientes(nombre), proyectos(nombre), sprint:sprints(numero, nombre, estado)"
          )
          .eq("numero", numero)
          .is("deleted_at", null)
          .maybeSingle()
        if (!data) return texto(`No existe la tarjeta ZQ-${numero}.`)

        const [{ data: comentarios }, { data: versiones }] = await Promise.all([
          supabase
            .from("tareas_comentarios")
            .select("autor, cuerpo, created_at")
            .eq("tarea_id", data.id)
            .is("deleted_at", null)
            .order("created_at"),
          supabase
            .from("tareas_versiones")
            .select("autor, created_at")
            .eq("tarea_id", data.id)
            .order("created_at"),
        ])

        const { id, ...tarjeta } = data
        void id
        return texto({
          tarjeta: { codigo: `ZQ-${data.numero}`, ...tarjeta },
          comentarios: comentarios ?? [],
          versiones: versiones ?? [],
        })
      }
    )

    server.registerTool(
      "crear_tarea",
      {
        title: "Crear una tarjeta",
        description:
          "Crea una tarjeta. Entra arriba de su columna (por defecto 'backlog', la lista de ideas fuera del tablero; usá 'por_hacer' para que entre directo al tablero). Cliente y proyecto se resuelven por nombre aproximado. Alcanza con el título: el brief (contexto/resultado/recursos/plan) se completa después con el prompt `desarrollar_tarea`. Los campos de planificación (`codigo_proyecto`, `estimacion`, `moscow`, `epica`) sólo aplican a proyectos que siguen el estándar de ingeniería; `codigo_proyecto` es único dentro de su proyecto. `sprint` la agrega a un sprint: al activo entra al tablero, a uno planificado queda en backlog hasta que se inicie. Sin `sprint`, una tarjeta que entra al tablero se suma sola al sprint activo si lo hay.",
        inputSchema: {
          titulo: z.string().min(3),
          descripcion: z.string().optional(),
          estado: z.enum(ESTADOS_TAREA).optional(),
          sprint: z
            .union([z.string(), z.number()])
            .describe("número del sprint (3, 'Sprint 3'); omitir para no asignar")
            .optional(),
          prioridad: z.enum(PRIORIDADES_TAREA).optional(),
          asignado_email: z
            .string()
            .describe("socio responsable; omitir para dejarla sin asignar")
            .optional(),
          cliente_nombre: z.string().optional(),
          proyecto_nombre: z.string().optional(),
          etiquetas: z.array(z.string()).optional(),
          fecha_limite: z.string().describe("YYYY-MM-DD").optional(),
          contexto: z
            .string()
            .describe("brief: ¿por qué existe? qué problema o pedido la origina y qué se sabe ya")
            .optional(),
          resultado: z
            .string()
            .describe("brief: ¿qué tiene que ser verdad al terminar? criterios de aceptación verificables")
            .optional(),
          recursos: z
            .string()
            .describe("brief: links, documentos, repos, accesos y personas, con URLs concretas")
            .optional(),
          plan: z
            .string()
            .describe("brief: pasos sugeridos en orden, cada uno accionable por sí solo")
            .optional(),
          ...ESQUEMA_PLANIFICACION,
        },
      },
      async (entrada, extra) => {
        const { socioId: actorId, autor } = await actorMcp(extra)

        const asignadoId = entrada.asignado_email
          ? await socioIdPorEmail(entrada.asignado_email)
          : null
        if (entrada.asignado_email && !asignadoId) {
          return texto(`No encontré un socio con email ${entrada.asignado_email}.`)
        }
        const clienteId = await idPorNombre("clientes", entrada.cliente_nombre)
        if (entrada.cliente_nombre && !clienteId) {
          return texto(
            `No encontré el cliente "${entrada.cliente_nombre}"; no creé nada. Probá sin cliente o con otro nombre.`
          )
        }
        const proyectoId = await idPorNombre("proyectos", entrada.proyecto_nombre)
        if (entrada.proyecto_nombre && !proyectoId) {
          return texto(
            `No encontré el proyecto "${entrada.proyecto_nombre}"; no creé nada.`
          )
        }

        const sprintPedido = await sprintPorReferencia(entrada.sprint)
        if (entrada.sprint !== undefined && !sprintPedido) {
          return texto(`No encontré el sprint "${entrada.sprint}"; no creé nada.`)
        }
        const supabase = createAdminClient()
        // Coherencia columna ↔ sprint (lib/sprints.ts): con sprint, la columna
        // se acomoda a él; sin sprint, entrar al tablero suma al activo.
        let ubicacion: Ubicacion
        try {
          ubicacion = await ubicacionCoherente(
            supabase,
            { estado: entrada.estado ?? "backlog", sprint_id: sprintPedido?.id ?? null },
            sprintPedido ? "sprint" : "estado"
          )
        } catch (e) {
          return texto(`${e instanceof Error ? e.message : e}; no creé nada.`)
        }
        const estado = ubicacion.estado
        const contenido = {
          titulo: entrada.titulo,
          descripcion: entrada.descripcion ?? null,
          contexto: entrada.contexto ?? null,
          resultado: entrada.resultado ?? null,
          recursos: entrada.recursos ?? null,
          plan: entrada.plan ?? null,
          estado,
          prioridad: entrada.prioridad ?? "media",
          etiquetas: entrada.etiquetas ?? [],
          fecha_limite: entrada.fecha_limite ?? null,
          codigo_proyecto: null as string | null,
          estimacion: entrada.estimacion ?? null,
          moscow: entrada.moscow ?? null,
          epica: null as string | null,
          ...normalizarPlanificacion(entrada),
        }
        const { data, error } = await supabase
          .from("tareas")
          .insert({
            ...contenido,
            asignado_a: asignadoId,
            cliente_id: clienteId ?? null,
            proyecto_id: proyectoId ?? null,
            sprint_id: ubicacion.sprint_id,
            orden: await ordenAlTopeDeColumna(estado),
            created_by: actorId,
            metadata: { origen: "mcp" },
          })
          .select("id, numero, titulo, estado, prioridad, sprint:sprints(numero, nombre)")
          .single()
        if (error) throw new Error(error.message)
        // Primer snapshot del historial, atribuido al agente.
        await supabase.from("tareas_versiones").insert({
          tarea_id: data.id,
          snapshot: contenido,
          autor,
          autor_socio_id: actorId,
        })
        const { id: _id, ...creada } = data
        void _id
        return texto({ creada: { codigo: `ZQ-${data.numero}`, ...creada }, ver: "/tareas" })
      }
    )

    server.registerTool(
      "actualizar_tarea",
      {
        title: "Actualizar una tarjeta",
        description:
          "Cambia campos de una tarjeta existente, incluido su brief de desarrollo (contexto / resultado / recursos / plan). Solo se tocan los campos que se pasan; string vacío limpia el campo (y desvincula cliente/proyecto/responsable). Cada edición queda en el historial de versiones. Para cambiarla de sprint usá `mover_a_sprint`.",
        inputSchema: {
          tarea: z.union([z.string(), z.number()]),
          titulo: z.string().min(3).optional(),
          descripcion: z.string().optional(),
          contexto: z
            .string()
            .describe("brief: por qué existe, qué la origina y qué se sabe ya")
            .optional(),
          resultado: z
            .string()
            .describe("brief: criterios de aceptación verificables")
            .optional(),
          recursos: z
            .string()
            .describe("brief: links, docs, repos, accesos y personas")
            .optional(),
          plan: z
            .string()
            .describe("brief: pasos sugeridos en orden")
            .optional(),
          estado: z.enum(ESTADOS_TAREA).optional(),
          prioridad: z.enum(PRIORIDADES_TAREA).optional(),
          asignado_email: z.string().optional(),
          cliente_nombre: z.string().optional(),
          proyecto_nombre: z.string().optional(),
          etiquetas: z.array(z.string()).optional(),
          fecha_limite: z.string().describe("YYYY-MM-DD").optional(),
          ...ESQUEMA_PLANIFICACION,
        },
      },
      async (entrada, extra) => {
        const numero = numeroDeTarea(entrada.tarea)
        if (!numero) return texto(`"${entrada.tarea}" no parece un número de tarjeta.`)

        const supabase = createAdminClient()
        const { data: actual } = await supabase
          .from("tareas")
          .select("id, estado, sprint_id")
          .eq("numero", numero)
          .is("deleted_at", null)
          .maybeSingle()
        if (!actual) return texto(`No existe la tarjeta ZQ-${numero}.`)

        const cambios: Record<string, unknown> = {}
        if (entrada.titulo !== undefined) cambios.titulo = entrada.titulo
        if (entrada.descripcion !== undefined)
          cambios.descripcion = entrada.descripcion || null
        for (const campo of CAMPOS_BRIEF) {
          if (entrada[campo] !== undefined) cambios[campo] = entrada[campo] || null
        }
        if (entrada.prioridad !== undefined) cambios.prioridad = entrada.prioridad
        if (entrada.etiquetas !== undefined) cambios.etiquetas = entrada.etiquetas
        if (entrada.fecha_limite !== undefined)
          cambios.fecha_limite = entrada.fecha_limite || null
        for (const campo of CAMPOS_PLANIFICACION) {
          if (entrada[campo] !== undefined) cambios[campo] = entrada[campo] || null
        }
        Object.assign(cambios, normalizarPlanificacion(entrada))

        if (entrada.estado !== undefined && entrada.estado !== actual.estado) {
          // El sprint se acomoda a la columna (entrar al tablero suma al
          // activo; volver a backlog desde el activo saca del sprint).
          const ubicacion = await ubicacionCoherente(
            supabase,
            { estado: entrada.estado, sprint_id: actual.sprint_id },
            "estado"
          )
          cambios.estado = ubicacion.estado
          cambios.sprint_id = ubicacion.sprint_id
          cambios.orden = await ordenAlTopeDeColumna(ubicacion.estado)
        }

        if (entrada.asignado_email !== undefined) {
          if (entrada.asignado_email === "") cambios.asignado_a = null
          else {
            const socioId = await socioIdPorEmail(entrada.asignado_email)
            if (!socioId)
              return texto(`No encontré un socio con email ${entrada.asignado_email}.`)
            cambios.asignado_a = socioId
          }
        }
        const clienteId = await idPorNombre("clientes", entrada.cliente_nombre)
        if (clienteId !== undefined) {
          if (entrada.cliente_nombre && !clienteId)
            return texto(`No encontré el cliente "${entrada.cliente_nombre}".`)
          cambios.cliente_id = clienteId
        }
        const proyectoId = await idPorNombre("proyectos", entrada.proyecto_nombre)
        if (proyectoId !== undefined) {
          if (entrada.proyecto_nombre && !proyectoId)
            return texto(`No encontré el proyecto "${entrada.proyecto_nombre}".`)
          cambios.proyecto_id = proyectoId
        }

        if (Object.keys(cambios).length === 0) {
          return texto(`No pasaste ningún cambio para ZQ-${numero}.`)
        }

        const { data, error } = await supabase
          .from("tareas")
          .update(cambios)
          .eq("id", actual.id)
          .select("*")
          .single()
        if (error) throw new Error(error.message)

        // Snapshot completo post-edición (no un delta), atribuido al agente.
        const { autor, socioId } = await actorMcp(extra)
        const snapshot: Record<string, unknown> = {}
        for (const campo of CAMPOS_TAREA) snapshot[campo] = data[campo]
        await supabase.from("tareas_versiones").insert({
          tarea_id: actual.id,
          snapshot,
          autor,
          autor_socio_id: socioId,
        })

        return texto({
          actualizada: {
            codigo: `ZQ-${data.numero}`,
            titulo: data.titulo,
            estado: data.estado,
            prioridad: data.prioridad,
          },
        })
      }
    )

    server.registerTool(
      "mover_tarea",
      {
        title: "Mover una tarjeta de columna",
        description:
          "Atajo para cambiar la columna de una tarjeta (backlog, por_hacer, en_curso, en_revision, hecho). 'por_hacer' es la columna de entrada al tablero; 'backlog' queda fuera del tablero. Queda arriba de la columna destino; para reordenar dentro de una columna usá priorizar_tarea.",
        inputSchema: {
          tarea: z.union([z.string(), z.number()]),
          estado: z.enum(ESTADOS_TAREA),
        },
      },
      async ({ tarea, estado }) => {
        const numero = numeroDeTarea(tarea)
        if (!numero) return texto(`"${tarea}" no parece un número de tarjeta.`)

        const supabase = createAdminClient()
        const { data: actual } = await supabase
          .from("tareas")
          .select("sprint_id")
          .eq("numero", numero)
          .is("deleted_at", null)
          .maybeSingle()
        if (!actual) return texto(`No existe la tarjeta ZQ-${numero}.`)
        // El sprint se acomoda a la columna (ver lib/sprints.ts).
        const ubicacion = await ubicacionCoherente(
          supabase,
          { estado, sprint_id: actual.sprint_id },
          "estado"
        )
        const { data, error } = await supabase
          .from("tareas")
          .update({ ...ubicacion, orden: await ordenAlTopeDeColumna(ubicacion.estado) })
          .eq("numero", numero)
          .is("deleted_at", null)
          .select("numero, titulo, estado, sprint:sprints(numero, nombre)")
          .maybeSingle()
        if (error) throw new Error(error.message)
        if (!data) return texto(`No existe la tarjeta ZQ-${numero}.`)
        return texto({ movida: { codigo: `ZQ-${data.numero}`, ...data } })
      }
    )

    server.registerTool(
      "priorizar_tarea",
      {
        title: "Priorizar una tarjeta dentro de su columna",
        description:
          "Reordena una tarjeta dentro de su columna sin cambiarla de estado (típicamente para priorizar el backlog). Indicá antes de qué tarjeta va (antes_de), después de cuál (despues_de), o posicion tope/fondo.",
        inputSchema: {
          tarea: z.union([z.string(), z.number()]),
          antes_de: z.union([z.string(), z.number()]).optional(),
          despues_de: z.union([z.string(), z.number()]).optional(),
          posicion: z.enum(["tope", "fondo"]).optional(),
        },
      },
      async ({ tarea, antes_de, despues_de, posicion }) => {
        const numero = numeroDeTarea(tarea)
        if (!numero) return texto(`"${tarea}" no parece un número de tarjeta.`)
        const referencia = antes_de ?? despues_de
        if (referencia === undefined && !posicion) {
          return texto(
            "Decime dónde va: antes_de/despues_de otra tarjeta, o posicion tope/fondo."
          )
        }

        const supabase = createAdminClient()
        const { data: tarjeta } = await supabase
          .from("tareas")
          .select("id, estado, titulo")
          .eq("numero", numero)
          .is("deleted_at", null)
          .maybeSingle()
        if (!tarjeta) return texto(`No existe la tarjeta ZQ-${numero}.`)

        let orden: number
        let donde: string
        if (referencia !== undefined) {
          const numeroRef = numeroDeTarea(referencia)
          if (!numeroRef)
            return texto(`"${referencia}" no parece un número de tarjeta.`)
          // La columna completa ordenada: la vecina del otro lado de la
          // referencia define el punto medio (mismo principio que el drag de
          // la UI: se escribe una sola fila).
          const { data: columna } = await supabase
            .from("tareas")
            .select("numero, orden")
            .eq("estado", tarjeta.estado)
            .is("deleted_at", null)
            .order("orden", { ascending: true })
          const filas = (columna ?? []).filter((t) => t.numero !== numero)
          const i = filas.findIndex((t) => t.numero === numeroRef)
          if (i === -1) {
            return texto(
              `ZQ-${numeroRef} no está en la columna '${tarjeta.estado}' de ZQ-${numero}. Para cambiarla de columna usá mover_tarea; no reordené nada.`
            )
          }
          const [anterior, siguiente] =
            antes_de !== undefined ? [filas[i - 1], filas[i]] : [filas[i], filas[i + 1]]
          if (anterior && siguiente)
            orden = (Number(anterior.orden) + Number(siguiente.orden)) / 2
          else if (anterior) orden = Number(anterior.orden) + 1
          else orden = Number(siguiente.orden) - 1
          donde =
            antes_de !== undefined
              ? `antes de ZQ-${numeroRef}`
              : `después de ZQ-${numeroRef}`
        } else if (posicion === "tope") {
          orden = await ordenAlTopeDeColumna(tarjeta.estado)
          donde = "al tope de la columna"
        } else {
          const { data: ultima } = await supabase
            .from("tareas")
            .select("orden")
            .eq("estado", tarjeta.estado)
            .is("deleted_at", null)
            .order("orden", { ascending: false })
            .limit(1)
            .maybeSingle()
          orden = Number(ultima?.orden ?? 0) + 1
          donde = "al fondo de la columna"
        }

        const { error } = await supabase
          .from("tareas")
          .update({ orden })
          .eq("id", tarjeta.id)
        if (error) throw new Error(error.message)
        return texto({
          priorizada: {
            codigo: `ZQ-${numero}`,
            titulo: tarjeta.titulo,
            estado: tarjeta.estado,
            quedo: donde,
          },
        })
      }
    )

    server.registerTool(
      "comentar_tarea",
      {
        title: "Comentar una tarjeta",
        description:
          "Agrega un comentario al hilo de una tarjeta. El autor queda registrado como el socio dueño del token, aclarando que vino por MCP.",
        inputSchema: {
          tarea: z.union([z.string(), z.number()]),
          cuerpo: z.string().min(2),
        },
      },
      async ({ tarea, cuerpo }, extra) => {
        const numero = numeroDeTarea(tarea)
        if (!numero) return texto(`"${tarea}" no parece un número de tarjeta.`)

        const supabase = createAdminClient()
        const { data: tarjeta } = await supabase
          .from("tareas")
          .select("id")
          .eq("numero", numero)
          .is("deleted_at", null)
          .maybeSingle()
        if (!tarjeta) return texto(`No existe la tarjeta ZQ-${numero}.`)

        const email = extra.authInfo?.extra?.email as string | undefined
        const socioId = email ? await socioIdPorEmail(email) : null
        const { data: socio } = socioId
          ? await supabase.from("socios").select("nombre").eq("id", socioId).maybeSingle()
          : { data: null }

        const { error } = await supabase.from("tareas_comentarios").insert({
          tarea_id: tarjeta.id,
          cuerpo,
          autor: `${socio?.nombre ?? email ?? "Agente"} (Claude)`,
          autor_socio_id: socioId,
        })
        if (error) throw new Error(error.message)
        return texto({ comentado: `ZQ-${numero}` })
      }
    )

    // ── Sprints ───────────────────────────────────────────────────────────
    // Ciclo estilo Jira sobre el mismo tablero: crear (planificado) → mover
    // tarjetas → iniciar (entran al tablero) → completar (lo hecho queda
    // archivado en el sprint, lo pendiente vuelve al backlog o pasa al
    // siguiente; el tablero queda limpio). Uno activo a la vez.
    server.registerTool(
      "listar_sprints",
      {
        title: "Listar sprints",
        description:
          "Sprints del tablero con sus métricas (tarjetas, hechas, puntos). Por defecto los abiertos (activo + planificados); `incluir_cerrados` suma el historial con el resumen de cierre. Las tarjetas de cada sprint se ven con `listar_tareas` filtrando por `sprint`.",
        inputSchema: {
          incluir_cerrados: z.boolean().optional(),
          limite: z.number().int().min(1).max(100).optional(),
        },
      },
      async ({ incluir_cerrados, limite }) => {
        const supabase = createAdminClient()
        let q = supabase
          .from("sprints")
          .select(
            "numero, nombre, objetivo, estado, fecha_inicio, fecha_fin, iniciado_at, cerrado_at, metadata, proyectos(nombre), tareas(estado, estimacion)"
          )
          .is("deleted_at", null)
          // Las tarjetas embebidas también filtran su soft delete.
          .is("tareas.deleted_at", null)
          .order("numero", { ascending: false })
          .limit(limite ?? 20)
        if (!incluir_cerrados) q = q.neq("estado", "cerrado")
        const { data, error } = await q
        if (error) throw new Error(error.message)

        const sprints = (data ?? []).map((s) => {
          const tarjetas = (s.tareas ?? []) as { estado: string; estimacion: number | null }[]
          const hechas = tarjetas.filter((t) => t.estado === "hecho")
          const { tareas, proyectos, metadata, ...resto } = s
          void tareas
          const proyecto = proyectos as unknown as { nombre: string } | null
          return {
            codigo: `Sprint ${s.numero}`,
            ...resto,
            proyecto: proyecto?.nombre ?? null,
            tarjetas: tarjetas.length,
            hechas: hechas.length,
            puntos: tarjetas.reduce((acc, t) => acc + (t.estimacion ?? 0), 0),
            puntos_hechos: hechas.reduce((acc, t) => acc + (t.estimacion ?? 0), 0),
            resumen_cierre: (metadata as { resumen?: unknown } | null)?.resumen ?? null,
          }
        })
        return texto({ sprints })
      }
    )

    server.registerTool(
      "crear_sprint",
      {
        title: "Crear un sprint",
        description:
          "Crea un sprint planificado. Después se le agregan tarjetas con `mover_a_sprint` (o `crear_tarea` con `sprint`) y se arranca con `iniciar_sprint`. `proyecto_nombre` es opcional: marca el foco del sprint, no restringe qué tarjetas entran.",
        inputSchema: {
          nombre: z.string().min(2).describe("p. ej. 'Sprint 4' o 'Sprint 4 — Onboarding'"),
          objetivo: z.string().optional(),
          fecha_inicio: z.string().describe("YYYY-MM-DD").optional(),
          fecha_fin: z.string().describe("YYYY-MM-DD").optional(),
          proyecto_nombre: z.string().optional(),
        },
      },
      async (entrada, extra) => {
        const proyectoId = await idPorNombre("proyectos", entrada.proyecto_nombre)
        if (entrada.proyecto_nombre && !proyectoId) {
          return texto(`No encontré el proyecto "${entrada.proyecto_nombre}"; no creé nada.`)
        }
        const { socioId } = await actorMcp(extra)
        const supabase = createAdminClient()
        const { data, error } = await supabase
          .from("sprints")
          .insert({
            nombre: entrada.nombre,
            objetivo: entrada.objetivo ?? null,
            fecha_inicio: entrada.fecha_inicio ?? null,
            fecha_fin: entrada.fecha_fin ?? null,
            proyecto_id: proyectoId ?? null,
            created_by: socioId,
            metadata: { origen: "mcp" },
          })
          .select("numero, nombre, estado, fecha_inicio, fecha_fin")
          .single()
        if (error) throw new Error(error.message)
        return texto({
          creado: { codigo: `Sprint ${data.numero}`, ...data },
          ver: "/tareas?vista=backlog",
        })
      }
    )

    server.registerTool(
      "mover_a_sprint",
      {
        title: "Mover una tarjeta a un sprint",
        description:
          "Agrega una tarjeta a un sprint, o la saca (sprint = 'backlog'). Al sprint activo entra al tablero (Por hacer, arriba); a un sprint planificado queda en backlog agrupada bajo él hasta que se inicie; sacarla del sprint la devuelve al backlog libre. No se agregan tarjetas a sprints cerrados.",
        inputSchema: {
          tarea: z.union([z.string(), z.number()]),
          sprint: z
            .union([z.string(), z.number()])
            .describe("número del sprint (3, 'Sprint 3'), 'activo', o 'backlog' para sacarla"),
        },
      },
      async ({ tarea, sprint }) => {
        const numero = numeroDeTarea(tarea)
        if (!numero) return texto(`"${tarea}" no parece un número de tarjeta.`)
        const supabase = createAdminClient()
        const { data: tarjeta } = await supabase
          .from("tareas")
          .select("id, titulo")
          .eq("numero", numero)
          .is("deleted_at", null)
          .maybeSingle()
        if (!tarjeta) return texto(`No existe la tarjeta ZQ-${numero}.`)

        const ref = String(sprint).trim().toLowerCase()
        let destino: SprintResumen | null = null
        if (ref !== "backlog" && ref !== "") {
          destino =
            ref === "activo"
              ? await sprintActivo(supabase)
              : (await sprintPorReferencia(sprint)) ?? null
          if (!destino) return texto(`No encontré el sprint "${sprint}".`)
        }
        try {
          const ubicacion = await moverTarjetaASprint(supabase, tarjeta.id, destino?.id ?? null)
          return texto({
            movida: {
              codigo: `ZQ-${numero}`,
              titulo: tarjeta.titulo,
              sprint: destino ? `Sprint ${destino.numero}` : null,
              estado: ubicacion.estado,
            },
          })
        } catch (e) {
          return texto(`${e instanceof Error ? e.message : e}; no moví nada.`)
        }
      }
    )

    server.registerTool(
      "iniciar_sprint",
      {
        title: "Iniciar un sprint",
        description:
          "Pasa un sprint planificado a activo: sus tarjetas entran al tope de Por hacer conservando su prioridad. Solo puede haber un sprint activo; si hay otro, hay que completarlo antes. Las fechas son opcionales (si no se pasan quedan las del sprint).",
        inputSchema: {
          sprint: z.union([z.string(), z.number()]),
          fecha_inicio: z.string().describe("YYYY-MM-DD").optional(),
          fecha_fin: z.string().describe("YYYY-MM-DD").optional(),
        },
      },
      async ({ sprint, fecha_inicio, fecha_fin }) => {
        const s = await sprintPorReferencia(sprint)
        if (!s) return texto(`No encontré el sprint "${sprint}".`)
        const supabase = createAdminClient()
        const { data: fechas } = await supabase
          .from("sprints")
          .select("fecha_inicio, fecha_fin")
          .eq("id", s.id)
          .maybeSingle()
        try {
          const resultado = await iniciarSprint(supabase, s.id, {
            fecha_inicio: fecha_inicio ?? fechas?.fecha_inicio ?? null,
            fecha_fin: fecha_fin ?? fechas?.fecha_fin ?? null,
          })
          return texto({
            iniciado: {
              codigo: `Sprint ${resultado.sprint.numero}`,
              nombre: resultado.sprint.nombre,
              tarjetas_al_tablero: resultado.tarjetas,
            },
            ver: "/tareas",
          })
        } catch (e) {
          return texto(`${e instanceof Error ? e.message : e}; no inicié nada.`)
        }
      }
    )

    server.registerTool(
      "completar_sprint",
      {
        title: "Completar un sprint",
        description:
          "Cierra el sprint activo y limpia el tablero: las tarjetas en 'hecho' quedan archivadas en el sprint (dejan de verse en el tablero) y las pendientes vuelven al backlog o pasan al sprint planificado que se indique en `pendientes_a`. Devuelve el resumen (hechas, pendientes, puntos). Antes de completar conviene revisar con listar_tareas(sprint='activo') qué queda pendiente y consultar al socio si no está claro adónde va.",
        inputSchema: {
          sprint: z
            .union([z.string(), z.number()])
            .describe("número del sprint o 'activo'")
            .optional(),
          pendientes_a: z
            .union([z.string(), z.number()])
            .describe("'backlog' (default) o el número de un sprint planificado")
            .optional(),
        },
      },
      async ({ sprint, pendientes_a }) => {
        const supabase = createAdminClient()
        const s =
          sprint === undefined || String(sprint).trim().toLowerCase() === "activo"
            ? await sprintActivo(supabase)
            : await sprintPorReferencia(sprint)
        if (!s) return texto(sprint === undefined ? "No hay un sprint activo." : `No encontré el sprint "${sprint}".`)

        let destino: { tipo: "backlog" } | { tipo: "sprint"; sprint_id: string } = {
          tipo: "backlog",
        }
        if (pendientes_a !== undefined && String(pendientes_a).trim().toLowerCase() !== "backlog") {
          const d = await sprintPorReferencia(pendientes_a)
          if (!d) return texto(`No encontré el sprint destino "${pendientes_a}"; no cerré nada.`)
          destino = { tipo: "sprint", sprint_id: d.id }
        }
        try {
          const r = await completarSprint(supabase, s.id, destino)
          return texto({
            completado: {
              codigo: `Sprint ${r.sprint.numero}`,
              nombre: r.sprint.nombre,
              hechas: r.hechas,
              pendientes: r.pendientes,
              puntos_hechos: r.puntos_hechos,
              pendientes_a: r.pendientes_a,
            },
            ver: "/tareas",
          })
        } catch (e) {
          return texto(`${e instanceof Error ? e.message : e}; no cerré nada.`)
        }
      }
    )

    // ── Calendario y ceremonias ───────────────────────────────────────────
    // Las ceremonias (planning, daily, review, retro) son datos del sprint,
    // una fila por ocurrencia; se ven en /tareas?vista=calendario.
    server.registerTool(
      "calendario_sprints",
      {
        title: "Calendario de sprints y ceremonias",
        description:
          "Sprints con fechas y sus ceremonias (planning, daily, review, retro) en un rango de días, opcionalmente filtrado por proyecto. Por defecto, el mes en curso. Sirve para responder '¿cuándo es la review?', '¿qué ceremonias hay esta semana?' o para revisar el calendario de un proyecto. Las horas se devuelven en hora de Montevideo.",
        inputSchema: {
          desde: z.string().describe("YYYY-MM-DD (default: primer día del mes actual)").optional(),
          hasta: z.string().describe("YYYY-MM-DD (default: último día del mes actual)").optional(),
          proyecto_nombre: z.string().optional(),
        },
      },
      async ({ desde, hasta, proyecto_nombre }) => {
        const hoy = paredEnZona(Date.now()).fecha
        const mes = hoy.slice(0, 7)
        const [a, m] = mes.split("-").map(Number)
        const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
        const d = desde ?? `${mes}-01`
        const h = hasta ?? `${mes}-${String(ultimo).padStart(2, "0")}`
        if (!FORMATO_FECHA.test(d) || !FORMATO_FECHA.test(h) || h < d) {
          return texto("Rango inválido: desde/hasta en formato YYYY-MM-DD y hasta ≥ desde.")
        }
        const proyectoId = await idPorNombre("proyectos", proyecto_nombre)
        if (proyecto_nombre && !proyectoId) {
          return texto(`No encontré el proyecto "${proyecto_nombre}".`)
        }
        const supabase = createAdminClient()
        let sprintsQ = supabase
          .from("sprints")
          .select("id, numero, nombre, estado, objetivo, fecha_inicio, fecha_fin, proyectos(nombre)")
          .is("deleted_at", null)
          .not("fecha_inicio", "is", null)
          .not("fecha_fin", "is", null)
          .lte("fecha_inicio", h)
          .gte("fecha_fin", d)
          .order("numero", { ascending: true })
        let ceremoniasQ = supabase
          .from("ceremonias")
          .select("tipo, inicio, duracion_min, notas, sprint:sprints!inner(numero, nombre, proyecto_id)")
          .is("deleted_at", null)
          .is("sprint.deleted_at", null)
          .gte("inicio", `${sumarDias(d, -1)}T00:00:00Z`)
          .lt("inicio", `${sumarDias(h, 2)}T00:00:00Z`)
          .order("inicio", { ascending: true })
        if (proyectoId) {
          sprintsQ = sprintsQ.eq("proyecto_id", proyectoId)
          ceremoniasQ = ceremoniasQ.eq("sprint.proyecto_id", proyectoId)
        }
        const [{ data: sprints, error: e1 }, { data: ceremonias, error: e2 }] =
          await Promise.all([sprintsQ, ceremoniasQ])
        if (e1) throw new Error(e1.message)
        if (e2) throw new Error(e2.message)

        return texto({
          rango: { desde: d, hasta: h },
          proyecto: proyecto_nombre ?? null,
          sprints: (sprints ?? []).map((s) => {
            const { proyectos, id, ...resto } = s
            void id
            return {
              codigo: `Sprint ${s.numero}`,
              ...resto,
              proyecto: (proyectos as unknown as { nombre: string } | null)?.nombre ?? null,
            }
          }),
          ceremonias: (ceremonias ?? [])
            .map((c) => {
              const pared = paredEnZona(Date.parse(c.inicio))
              const sprint = c.sprint as unknown as { numero: number; nombre: string }
              return {
                fecha: pared.fecha,
                hora: pared.hora,
                tipo: c.tipo,
                duracion_min: c.duracion_min,
                sprint: `Sprint ${sprint.numero}`,
                notas: c.notas,
              }
            })
            .filter((c) => c.fecha >= d && c.fecha <= h),
          ver: "/tareas?vista=calendario",
        })
      }
    )

    server.registerTool(
      "definir_ceremonias",
      {
        title: "Definir las ceremonias de un sprint",
        description:
          "Define (reemplazando las anteriores) las ceremonias de un sprint: planning, daily, review y retro. La daily se genera una por día hábil elegido entre las fechas del sprint; las otras son una cada una. Sin parámetros de ceremonias usa el plan de siempre: planning el primer día 10:00, daily L–V 09:30 (15 min), review 15:00 y retro 16:30 el último día. Horas en hora de Montevideo. Pasar `null` en una ceremonia la omite. El sprint necesita fecha de inicio y fin (para las dailies).",
        inputSchema: {
          sprint: z.union([z.string(), z.number()]).describe("número del sprint o 'activo'"),
          planning: z
            .object({ fecha: z.string(), hora: z.string(), duracion_min: z.number().int().optional() })
            .nullable()
            .optional(),
          daily: z
            .object({
              hora: z.string(),
              duracion_min: z.number().int().optional(),
              dias: z.array(z.number().int().min(1).max(7)).describe("1=lunes … 5=viernes").optional(),
            })
            .nullable()
            .optional(),
          review: z
            .object({ fecha: z.string(), hora: z.string(), duracion_min: z.number().int().optional() })
            .nullable()
            .optional(),
          retro: z
            .object({ fecha: z.string(), hora: z.string(), duracion_min: z.number().int().optional() })
            .nullable()
            .optional(),
        },
      },
      async (entrada, extra) => {
        const supabase = createAdminClient()
        const s =
          String(entrada.sprint).trim().toLowerCase() === "activo"
            ? await sprintActivo(supabase)
            : await sprintPorReferencia(entrada.sprint)
        if (!s) return texto(`No encontré el sprint "${entrada.sprint}".`)
        const { data: fechas } = await supabase
          .from("sprints")
          .select("fecha_inicio, fecha_fin")
          .eq("id", s.id)
          .maybeSingle()
        const seDioAlguna =
          entrada.planning !== undefined ||
          entrada.daily !== undefined ||
          entrada.review !== undefined ||
          entrada.retro !== undefined
        const plan: PlanCeremonias = seDioAlguna
          ? {
              planning: entrada.planning ?? null,
              daily: entrada.daily ?? null,
              review: entrada.review ?? null,
              retro: entrada.retro ?? null,
            }
          : planPorDefecto(fechas ?? { fecha_inicio: null, fecha_fin: null })
        const { socioId } = await actorMcp(extra)
        try {
          const r = await definirCeremonias(supabase, s.id, plan, socioId)
          return texto({
            sprint: `Sprint ${s.numero}`,
            ceremonias_creadas: r.creadas,
            reemplazadas: r.reemplazadas,
            ver: "/tareas?vista=calendario",
          })
        } catch (e) {
          return texto(`${e instanceof Error ? e.message : e}; no cambié nada.`)
        }
      }
    )

    // ── Banco de ideas ────────────────────────────────────────────────────
    // El módulo pensado para iterar CON Claude: las ideas se capturan crudas
    // y maduran conversando hasta un one-pager (problema / solución /
    // esfuerzo / impacto / próximos pasos). Cada creación/edición deja un
    // snapshot en ideas_versiones con su autor. El borrado sigue siendo solo
    // de la UI.
    server.registerTool(
      "listar_ideas",
      {
        title: "Listar ideas",
        description:
          "Ideas del banco agrupadas por estado (semilla, en_exploracion, lista, aprobada, descartada), con sus votos. Por defecto omite las descartadas.",
        inputSchema: {
          estado: z.enum(ESTADOS_IDEA).optional(),
          incluir_descartadas: z.boolean().optional(),
          limite: z.number().int().min(1).max(200).optional(),
        },
      },
      async ({ estado, incluir_descartadas, limite }) => {
        const supabase = createAdminClient()
        let q = supabase
          .from("ideas")
          .select(
            "id, numero, titulo, descripcion, problema, competencia, solucion, esfuerzo, impacto, proximos_pasos, estado, etiquetas, creador:socios!ideas_created_by_fkey(nombre), created_at"
          )
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(limite ?? 100)
        if (estado) q = q.eq("estado", estado)
        else if (!incluir_descartadas) q = q.neq("estado", "descartada")

        const { data, error } = await q
        if (error) throw new Error(error.message)

        const { data: votos } = await supabase
          .from("ideas_votos")
          .select("idea_id")
        const votosPorIdea = new Map<string, number>()
        for (const v of votos ?? []) {
          votosPorIdea.set(v.idea_id, (votosPorIdea.get(v.idea_id) ?? 0) + 1)
        }

        const porEstado: Record<string, unknown[]> = {}
        for (const i of data ?? []) {
          const { id, numero, ...resto } = i
          ;(porEstado[i.estado] ??= []).push({
            codigo: `IDEA-${numero}`,
            votos: votosPorIdea.get(id) ?? 0,
            ...resto,
          })
        }
        return texto({ ideas: porEstado })
      }
    )

    server.registerTool(
      "ficha_idea",
      {
        title: "Ficha de una idea",
        description:
          "Detalle completo de una idea: one-pager, votos, comentarios e historial de versiones. Se identifica por número o código (7 o IDEA-7).",
        inputSchema: { idea: z.union([z.string(), z.number()]) },
      },
      async ({ idea }) => {
        const numero = numeroDeIdea(idea)
        if (!numero) return texto(`"${idea}" no parece un número de idea (ej. IDEA-7).`)

        const supabase = createAdminClient()
        const { data } = await supabase
          .from("ideas")
          .select(
            "id, numero, titulo, descripcion, problema, competencia, solucion, esfuerzo, impacto, proximos_pasos, estado, etiquetas, creador:socios!ideas_created_by_fkey(nombre), created_at, updated_at"
          )
          .eq("numero", numero)
          .is("deleted_at", null)
          .maybeSingle()
        if (!data) return texto(`No existe la idea IDEA-${numero}.`)

        const [{ data: comentarios }, { data: versiones }, { data: votos }] =
          await Promise.all([
            supabase
              .from("ideas_comentarios")
              .select("autor, cuerpo, created_at")
              .eq("idea_id", data.id)
              .is("deleted_at", null)
              .order("created_at"),
            supabase
              .from("ideas_versiones")
              .select("autor, created_at")
              .eq("idea_id", data.id)
              .order("created_at"),
            supabase
              .from("ideas_votos")
              .select("socios(nombre)")
              .eq("idea_id", data.id),
          ])

        const { id, numero: n, ...ficha } = data
        void id
        return texto({
          idea: { codigo: `IDEA-${n}`, ...ficha },
          votos: (votos ?? []).map((v) => {
            const socio = v.socios as { nombre: string } | { nombre: string }[] | null
            return (Array.isArray(socio) ? socio[0]?.nombre : socio?.nombre) ?? "?"
          }),
          comentarios: comentarios ?? [],
          versiones: versiones ?? [],
        })
      }
    )

    server.registerTool(
      "crear_idea",
      {
        title: "Guardar una idea nueva",
        description:
          "Crea una idea en el banco. Puede entrar cruda (solo título, estado 'semilla') o ya trabajada con el one-pager completo (problema, competencia, solución, esfuerzo, impacto, próximos pasos). Los campos del one-pager aceptan Markdown: usar listas para enumeraciones y negritas para números clave. Antes de crear, conviene usar `buscar` para detectar ideas parecidas ya guardadas.",
        inputSchema: {
          titulo: z.string().min(3),
          descripcion: z.string().describe("la semilla original: la nota cruda de la que arranca la idea; se escribe al capturar y no se actualiza al madurar").optional(),
          problema: z.string().describe("qué problema real resuelve y a quién le duele").optional(),
          competencia: z.string().describe("quién lo resuelve hoy, a qué precio, y nuestro diferencial").optional(),
          solucion: z.string().describe("cómo se resuelve, versión mínima primero").optional(),
          esfuerzo: z.string().describe("qué implica construirla: tiempo, plata, dependencias").optional(),
          impacto: z.string().describe("qué cambia si funciona y cómo se mide").optional(),
          proximos_pasos: z.string().describe("qué hacer primero para validarla").optional(),
          estado: z.enum(ESTADOS_IDEA).optional(),
          etiquetas: z.array(z.string()).optional(),
        },
      },
      async (entrada, extra) => {
        const { socioId, autor } = await actorMcp(extra)
        const supabase = createAdminClient()

        const datos = {
          titulo: entrada.titulo,
          descripcion: entrada.descripcion ?? null,
          problema: entrada.problema ?? null,
          competencia: entrada.competencia ?? null,
          solucion: entrada.solucion ?? null,
          esfuerzo: entrada.esfuerzo ?? null,
          impacto: entrada.impacto ?? null,
          proximos_pasos: entrada.proximos_pasos ?? null,
          estado: entrada.estado ?? "semilla",
          etiquetas: entrada.etiquetas ?? [],
        }
        const { data, error } = await supabase
          .from("ideas")
          .insert({ ...datos, created_by: socioId, metadata: { origen: "mcp" } })
          .select("id, numero, titulo, estado")
          .single()
        if (error) throw new Error(error.message)

        await supabase.from("ideas_versiones").insert({
          idea_id: data.id,
          snapshot: datos,
          autor,
          autor_socio_id: socioId,
        })
        return texto({
          creada: { codigo: `IDEA-${data.numero}`, titulo: data.titulo, estado: data.estado },
          ver: `/ideas`,
        })
      }
    )

    server.registerTool(
      "actualizar_idea",
      {
        title: "Actualizar una idea",
        description:
          "Actualiza campos de una idea existente (one-pager, estado, etiquetas). Solo se tocan los campos que se pasan; string vacío limpia el campo. Los campos del one-pager aceptan Markdown: usar listas para enumeraciones y negritas para números clave. Cada edición queda en el historial de versiones con su autor.",
        inputSchema: {
          idea: z.union([z.string(), z.number()]),
          titulo: z.string().min(3).optional(),
          descripcion: z
            .string()
            .describe(
              "la semilla original del socio; NO actualizarla al madurar la idea — el avance va en el one-pager"
            )
            .optional(),
          problema: z.string().optional(),
          competencia: z.string().optional(),
          solucion: z.string().optional(),
          esfuerzo: z.string().optional(),
          impacto: z.string().optional(),
          proximos_pasos: z.string().optional(),
          estado: z.enum(ESTADOS_IDEA).optional(),
          etiquetas: z.array(z.string()).optional(),
        },
      },
      async (entrada, extra) => {
        const numero = numeroDeIdea(entrada.idea)
        if (!numero) return texto(`"${entrada.idea}" no parece un número de idea.`)

        const supabase = createAdminClient()
        const { data: actual } = await supabase
          .from("ideas")
          .select("*")
          .eq("numero", numero)
          .is("deleted_at", null)
          .maybeSingle()
        if (!actual) return texto(`No existe la idea IDEA-${numero}.`)

        const cambios: Record<string, unknown> = {}
        if (entrada.titulo !== undefined) cambios.titulo = entrada.titulo
        for (const campo of [
          "descripcion",
          "problema",
          "competencia",
          "solucion",
          "esfuerzo",
          "impacto",
          "proximos_pasos",
        ] as const) {
          if (entrada[campo] !== undefined) cambios[campo] = entrada[campo] || null
        }
        if (entrada.estado !== undefined) cambios.estado = entrada.estado
        if (entrada.etiquetas !== undefined) cambios.etiquetas = entrada.etiquetas

        if (Object.keys(cambios).length === 0) {
          return texto(`No pasaste ningún cambio para IDEA-${numero}.`)
        }

        const { data, error } = await supabase
          .from("ideas")
          .update(cambios)
          .eq("id", actual.id)
          .select("*")
          .single()
        if (error) throw new Error(error.message)

        const { socioId, autor } = await actorMcp(extra)
        const snapshot: Record<string, unknown> = {}
        for (const campo of CAMPOS_IDEA) snapshot[campo] = data[campo]
        await supabase.from("ideas_versiones").insert({
          idea_id: actual.id,
          snapshot,
          autor,
          autor_socio_id: socioId,
        })
        return texto({
          actualizada: { codigo: `IDEA-${data.numero}`, titulo: data.titulo, estado: data.estado },
        })
      }
    )

    server.registerTool(
      "comentar_idea",
      {
        title: "Comentar una idea",
        description:
          "Agrega un comentario al hilo de una idea. El autor queda registrado como el socio dueño del token, aclarando que vino por MCP.",
        inputSchema: {
          idea: z.union([z.string(), z.number()]),
          cuerpo: z.string().min(2),
        },
      },
      async ({ idea, cuerpo }, extra) => {
        const numero = numeroDeIdea(idea)
        if (!numero) return texto(`"${idea}" no parece un número de idea.`)

        const supabase = createAdminClient()
        const { data } = await supabase
          .from("ideas")
          .select("id")
          .eq("numero", numero)
          .is("deleted_at", null)
          .maybeSingle()
        if (!data) return texto(`No existe la idea IDEA-${numero}.`)

        const { socioId, autor } = await actorMcp(extra)
        const { error } = await supabase.from("ideas_comentarios").insert({
          idea_id: data.id,
          cuerpo,
          autor,
          autor_socio_id: socioId,
        })
        if (error) throw new Error(error.message)
        return texto({ comentada: `IDEA-${numero}` })
      }
    )

    server.registerTool(
      "votar_idea",
      {
        title: "Votar una idea",
        description:
          "Suma el +1 del socio dueño del token a una idea (o lo quita con quitar_voto). Un voto por socio por idea.",
        inputSchema: {
          idea: z.union([z.string(), z.number()]),
          quitar_voto: z.boolean().optional(),
        },
      },
      async ({ idea, quitar_voto }, extra) => {
        const numero = numeroDeIdea(idea)
        if (!numero) return texto(`"${idea}" no parece un número de idea.`)

        const email = extra.authInfo?.extra?.email as string | undefined
        const socioId = email ? await socioIdPorEmail(email) : null
        if (!socioId) {
          return texto("No pude identificar al socio dueño del token para votar.")
        }

        const supabase = createAdminClient()
        const { data } = await supabase
          .from("ideas")
          .select("id")
          .eq("numero", numero)
          .is("deleted_at", null)
          .maybeSingle()
        if (!data) return texto(`No existe la idea IDEA-${numero}.`)

        if (quitar_voto) {
          const { error } = await supabase
            .from("ideas_votos")
            .delete()
            .eq("idea_id", data.id)
            .eq("socio_id", socioId)
          if (error) throw new Error(error.message)
          return texto({ voto_quitado: `IDEA-${numero}` })
        }
        // Upsert sobre la unique (idea_id, socio_id): votar dos veces no duplica.
        const { error } = await supabase
          .from("ideas_votos")
          .upsert(
            { idea_id: data.id, socio_id: socioId },
            { onConflict: "idea_id,socio_id" }
          )
        if (error) throw new Error(error.message)
        return texto({ votada: `IDEA-${numero}` })
      }
    )

    server.registerTool(
      "graduar_idea",
      {
        title: "Graduar una idea aprobada",
        description:
          "Convierte una idea del banco en trabajo real: un proyecto interno (con tareas iniciales opcionales colgando de él) o tareas sueltas del kanban. La idea pasa a estado 'aprobada' y queda vinculada a lo que generó. Usar cuando los socios ya decidieron hacerla; las tareas suelen salir de los próximos pasos del one-pager.",
        inputSchema: {
          idea: z.union([z.string(), z.number()]),
          destino: z
            .enum(["proyecto", "tareas"])
            .describe(
              "ideas grandes → 'proyecto' (interno, sin cliente); ideas chicas → 'tareas' sueltas"
            ),
          proyecto_nombre: z
            .string()
            .describe("nombre del proyecto; default el título de la idea")
            .optional(),
          tareas: z
            .array(z.string())
            .describe(
              "títulos de las tareas iniciales, en orden; obligatorio si destino='tareas'"
            )
            .optional(),
        },
      },
      async ({ idea, destino, proyecto_nombre, tareas }, extra) => {
        const numero = numeroDeIdea(idea)
        if (!numero) return texto(`"${idea}" no parece un número de idea.`)

        const supabase = createAdminClient()
        const { data: actual } = await supabase
          .from("ideas")
          .select("*")
          .eq("numero", numero)
          .is("deleted_at", null)
          .maybeSingle()
        if (!actual) return texto(`No existe la idea IDEA-${numero}.`)
        if (actual.estado === "aprobada") {
          return texto(`IDEA-${numero} ya está graduada; no hice nada.`)
        }

        const titulosTareas = (tareas ?? []).map((t) => t.trim()).filter(Boolean)
        if (destino === "tareas" && titulosTareas.length === 0) {
          return texto(
            "Para graduar a tareas sueltas hace falta al menos un título en `tareas`."
          )
        }

        const { socioId } = await actorMcp(extra)
        const codigo = `IDEA-${numero}`

        let proyectoId: string | null = null
        let proyectoNombre: string | null = null
        if (destino === "proyecto") {
          proyectoNombre = proyecto_nombre?.trim() || actual.titulo
          const { data: proyecto, error } = await supabase
            .from("proyectos")
            .insert({
              nombre: proyectoNombre,
              cliente_id: null,
              descripcion: `Proyecto interno graduado del banco de ideas (${codigo}: ${actual.titulo}).`,
              estado: "propuesta",
              metadata: { idea: codigo, origen: "mcp" },
              created_by: socioId,
            })
            .select("id")
            .single()
          if (error) throw new Error(error.message)
          proyectoId = proyecto.id
        }

        // Las tareas entran arriba del backlog, en el orden recibido.
        const numerosTareas: number[] = []
        if (titulosTareas.length > 0) {
          const base =
            (await ordenAlTopeDeColumna("backlog")) - titulosTareas.length + 1
          const { data: creadas, error } = await supabase
            .from("tareas")
            .insert(
              titulosTareas.map((titulo, i) => ({
                titulo,
                estado: "backlog",
                prioridad: "media",
                proyecto_id: proyectoId,
                etiquetas: [codigo],
                contexto: `Sale de la idea ${codigo} ("${actual.titulo}") del banco de ideas. El one-pager de la idea tiene el contexto completo (ficha_idea ${codigo}).`,
                orden: base + i,
                created_by: socioId,
                metadata: { idea: codigo, origen: "mcp" },
              }))
            )
            .select("numero")
          if (error) throw new Error(error.message)
          for (const t of creadas ?? []) numerosTareas.push(t.numero)
        }

        const { error } = await supabase
          .from("ideas")
          .update({
            estado: "aprobada",
            proyecto_id: proyectoId,
            metadata: {
              ...(actual.metadata ?? {}),
              graduacion: {
                destino,
                fecha: new Date().toISOString().slice(0, 10),
                tareas: numerosTareas,
              },
            },
          })
          .eq("id", actual.id)
        if (error) throw new Error(error.message)

        const { autor } = await actorMcp(extra)
        const snapshot: Record<string, unknown> = {}
        for (const campo of CAMPOS_IDEA) snapshot[campo] = actual[campo]
        snapshot.estado = "aprobada"
        await supabase.from("ideas_versiones").insert({
          idea_id: actual.id,
          snapshot,
          autor,
          autor_socio_id: socioId,
        })

        return texto({
          graduada: codigo,
          proyecto: proyectoNombre,
          tareas: numerosTareas.map((n) => `ZQ-${n}`),
          ver: "/ideas",
        })
      }
    )

    server.registerTool(
      "deshacer_graduacion",
      {
        title: "Deshacer la graduación de una idea",
        description:
          "Revierte una graduación: archiva el proyecto y las tareas que generó, limpia la trazabilidad y devuelve la idea a estado 'lista' con su one-pager intacto. Lo archivado es soft delete (recuperable desde la base).",
        inputSchema: { idea: z.union([z.string(), z.number()]) },
      },
      async ({ idea }, extra) => {
        const numero = numeroDeIdea(idea)
        if (!numero) return texto(`"${idea}" no parece un número de idea.`)

        const supabase = createAdminClient()
        const { data: actual } = await supabase
          .from("ideas")
          .select("*")
          .eq("numero", numero)
          .is("deleted_at", null)
          .maybeSingle()
        if (!actual) return texto(`No existe la idea IDEA-${numero}.`)

        const graduacion = actual.metadata?.graduacion as
          | { destino: string; fecha: string; tareas: number[] }
          | undefined
        if (!graduacion) {
          return texto(`IDEA-${numero} no está graduada; no hice nada.`)
        }

        const ahora = new Date().toISOString()

        if (graduacion.tareas.length > 0) {
          const { error } = await supabase
            .from("tareas")
            .update({ deleted_at: ahora })
            .in("numero", graduacion.tareas)
            .is("deleted_at", null)
          if (error) throw new Error(error.message)
        }

        if (actual.proyecto_id) {
          const { error } = await supabase
            .from("proyectos")
            .update({ deleted_at: ahora })
            .eq("id", actual.proyecto_id)
            .is("deleted_at", null)
          if (error) throw new Error(error.message)
        }

        const { graduacion: _descartada, ...metadata } = actual.metadata ?? {}
        void _descartada

        const { error } = await supabase
          .from("ideas")
          .update({ estado: "lista", proyecto_id: null, metadata })
          .eq("id", actual.id)
        if (error) throw new Error(error.message)

        const { socioId, autor } = await actorMcp(extra)
        const snapshot: Record<string, unknown> = {}
        for (const campo of CAMPOS_IDEA) snapshot[campo] = actual[campo]
        snapshot.estado = "lista"
        await supabase.from("ideas_versiones").insert({
          idea_id: actual.id,
          snapshot,
          autor,
          autor_socio_id: socioId,
        })

        return texto({
          desgraduada: `IDEA-${numero}`,
          archivadas: graduacion.tareas.map((n) => `ZQ-${n}`),
          estado: "lista",
        })
      }
    )

    // Prompt guía: la entrevista estándar para que los 4 socios bajen ideas a
    // tierra con el mismo proceso, sin depender de que cada uno sepa preguntar.
    server.registerPrompt(
      "bajar_idea_a_tierra",
      {
        title: "Bajar una idea a tierra",
        description:
          "Entrevista guiada para madurar una idea del banco: problema, competencia, solución mínima, esfuerzo, impacto y próximos pasos. Termina guardándola con crear_idea o actualizar_idea.",
        argsSchema: {
          idea: z
            .string()
            .describe(
              "código de una idea existente (IDEA-7) para retomarla; vacío para arrancar de cero"
            )
            .optional(),
        },
      },
      ({ idea }) => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                "Ayudame a bajar a tierra una idea para ZQUARE usando el banco de ideas del backoffice.",
                "",
                idea
                  ? `La idea es ${idea}: traé su ficha con \`ficha_idea\` y retomá desde lo que ya tiene.`
                  : "Arranco de cero: primero pedime que te cuente la idea cruda en una o dos frases. Después usá `buscar` para ver si ya hay una idea parecida guardada — si la hay, avisame y propongo retomarla en vez de duplicar.",
                "",
                "Entrevistame para completar el one-pager, de a UNA pregunta por vez, escuchando antes de pasar a la siguiente:",
                "1. **Problema**: ¿qué problema real resuelve y a quién le duele? Distinguí dolor urgente (\"pelo en llamas\") de conveniencia incremental — y si la idea nace de una tecnología buscando problema, decímelo sin vueltas. Preguntá también **¿por qué ahora?**: qué cambió (tecnología, comportamiento, regulación) para que esto sea viable hoy y no hace dos años.",
                "2. **Competencia**: definila desde el cliente, no por categoría — ¿qué usaría para resolver esto si nuestra idea no existiera? (incluye la planilla, el WhatsApp, un empleado, o nada). Acá el trabajo es tuyo: si tenés búsqueda web, investigá qué productos existen (globales y de la región), qué cobran, y miná sus reviews de 1-3 estrellas — ahí están las quejas reales en el idioma real del cliente. Etiquetá cada dato: verificado o supuesto. El campo `competencia` cierra con nuestro diferencial pasado por el test ¿no PUEDEN copiarlo o no QUIEREN (porque canibaliza su negocio)? — y si el diferencial no aparece, decímelo sin vueltas.",
                "3. **Solución**: ¿cuál es la versión mínima que lo resuelve? Empujá hacia lo más chico que sirva, y obligame a elegir: ¿competimos por diferente o por más barato? En el medio no se gana.",
                "4. **Esfuerzo**: ¿qué implica construirla (tiempo, plata, dependencias)? Incluí el esfuerzo operativo que nadie estima (venta, onboarding, soporte). ¿Se puede validar con una versión manual/concierge antes de escribir código? Usá el contexto del backoffice si ayuda (clientes, finanzas, proyectos).",
                "5. **Impacto**: ¿qué cambia si funciona y cómo lo mediríamos? Números a escala ZQUARE (no fantasías de unicornio), contrastados con los precios de la competencia relevados.",
                "6. **Próximos pasos**: ¿qué es lo primero que habría que hacer para validarla? Priorizá validar con desconocidos que pagan sobre amigos que opinan — el feedback tibio de gente cercana es la trampa clásica. Medir uso real, no opiniones.",
                "",
                "Escribí los campos del one-pager en Markdown pensado para leerse rápido: listas numeradas para los próximos pasos, bullets para enumeraciones (competidores, funcionalidades), **negritas** en los números clave (precios, metas, plazos), y párrafos cortos — nada de bloques largos de prosa. La `descripcion` es la semilla original del socio: no la pises ni la reescribas — la idea madurada vive en el one-pager. Sé crítico pero constructivo: cuestioná supuestos, señalá riesgos, y si la idea se solapa con algo que ZQUARE ya tiene o decidió, decilo. Si a mitad de la entrevista la idea revela ser una trampa (mercado saturado sin diferencial, dolor inexistente), proponé descartarla con honestidad — descartar rápido también es un buen resultado del banco.",
                "",
                idea
                  ? "Al cerrar cada parte, guardá el avance con `actualizar_idea` (así queda el historial de versiones)."
                  : "Cuando tengamos el título y el problema, guardala con `crear_idea` en estado `en_exploracion` y seguí actualizándola con `actualizar_idea` a medida que avanzamos.",
                "Cuando el one-pager esté completo y yo esté conforme, pasala a estado `lista` y cerrá con un resumen del one-pager. La aprobación es de los socios (comentarios y votos en el banco); cuando decidan hacerla, se gradúa con `graduar_idea` — ideas grandes a proyecto interno, chicas a tareas sueltas, con los próximos pasos como tareas iniciales.",
              ].join("\n"),
            },
          },
        ],
      })
    )

    // Prompt guía: la entrevista estándar para desarrollar una tarjeta del
    // tablero hasta que cualquier persona o agente pueda resolverla sin más
    // contexto. Espejo de bajar_idea_a_tierra, pero siempre parte de una
    // tarjeta existente.
    server.registerPrompt(
      "desarrollar_tarea",
      {
        title: "Desarrollar una tarjeta del tablero",
        description:
          "Entrevista guiada para completar el brief de una tarjeta (contexto, resultado, recursos, plan) y dejarla lista para que cualquier persona o agente la resuelva.",
        argsSchema: {
          tarea: z.string().describe("código de la tarjeta a desarrollar (ZQ-12 o 12)"),
        },
      },
      ({ tarea }) => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                "Ayudame a desarrollar una tarjeta del tablero de ZQUARE: dejarla con un brief tan completo que cualquiera —incluido otro agente de IA sin este contexto— pueda agarrarla y resolverla.",
                "",
                `La tarjeta es ${tarea}: traé su ficha con \`ficha_tarea\` y leé título, descripción y comentarios antes de preguntarme nada. Si ya tiene parte del brief, retomá desde lo que hay en vez de repetir preguntas.`,
                "",
                "Antes de entrevistarme, buscá contexto real en el backoffice: usá `buscar` con el tema de la tarjeta (y `ficha_cliente` si tiene cliente asociado) para traer decisiones, documentos, proyectos o tareas relacionadas. Contame lo que encontraste: no me preguntes lo que el backoffice ya sabe.",
                "",
                "Después entrevistame para completar el brief, de a UNA pregunta por vez, escuchando la respuesta antes de pasar a la siguiente:",
                "1. **Contexto**: ¿por qué existe esta tarea? ¿Qué problema o pedido la origina y qué se sabe ya? Sumá lo que encontraste con `buscar`.",
                "2. **Resultado**: ¿qué tiene que ser verdad cuando esté terminada? Empujá hacia criterios de aceptación verificables: que un tercero pueda chequearlos sin preguntar nada.",
                "3. **Recursos**: ¿qué links, documentos, repos, accesos o personas hacen falta? Anotá URLs concretas, no descripciones vagas.",
                "4. **Plan**: proponé vos los pasos en orden a partir de todo lo anterior y ajustalos con mi feedback. Cada paso debería ser accionable por sí solo.",
                "",
                "Sé crítico, no un escriba: si la tarea es ambigua o el resultado no se puede verificar, decilo antes de rellenar campos por rellenar. Si es demasiado grande para una sola tarjeta, proponé cómo partirla; si estoy de acuerdo, creá las tarjetas nuevas con `crear_tarea` (cada una con su propio brief mínimo) y referenciá sus códigos en el plan de esta.",
                "",
                "Guardá el avance con `actualizar_tarea` al cerrar cada campo, no todo junto al final: así queda el historial de versiones.",
                "",
                "Cuando el brief esté completo y yo esté conforme: dejá un comentario resumen con `comentar_tarea` (una o dos líneas: qué quedó definido y qué falta decidir, si algo), y si la tarjeta está en `backlog` preguntame si la pasamos a `por_hacer` con `mover_tarea` — no la muevas sin preguntar. Cerrá mostrándome el brief final.",
              ].join("\n"),
            },
          },
        ],
      })
    )

    // Prompt guía: el arranque estandarizado de un proyecto. Tercera pata del
    // mismo patrón que `bajar_idea_a_tierra` y `desarrollar_tarea`: leer lo
    // que el backoffice ya sabe, entrevistar solo por lo que falta, y dejar
    // guardado el resultado. Acá el resultado no es solo texto: son las tareas
    // y decisiones con las que el equipo arranca a trabajar.
    server.registerPrompt(
      "comenzar_proyecto",
      {
        title: "Comenzar un proyecto",
        description:
          "Arranque estandarizado de un proyecto: lee sus documentos, completa el brief (objetivo, alcance, stakeholders, stack, accesos, riesgos, hitos) y deja creados los insumos para empezar — tareas de setup, primeras historias y decisiones de arranque.",
        argsSchema: {
          proyecto: z.string().describe("nombre del proyecto a comenzar"),
        },
      },
      ({ proyecto }) => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Ayudame a arrancar el proyecto "${proyecto}" de ZQUARE: dejarlo con un brief tan completo y con los insumos tan armados que cualquiera del equipo —incluido otro agente sin este contexto— pueda ponerse a trabajar sin preguntar nada.`,
                "",
                "**Primero leé, después preguntá.** No me hagas ninguna pregunta hasta terminar este bloque:",
                `1. \`ficha_proyecto\` de "${proyecto}": trae el brief que ya tenga, cliente, presupuestos, documentos, decisiones, tareas e idea de origen. Mirá \`campos_brief_faltantes\` y \`precondiciones\`.`,
                "2. `buscar` con el nombre del proyecto y con los temas que aparezcan en su descripción: los documentos de Drive (propuesta, contrato, análisis, minutas) están indexados y suelen tener el alcance ya escrito. Leé lo que encuentres.",
                "3. Si tiene cliente, `ficha_cliente`: proyectos previos con ese cliente, decisiones tomadas y cómo se trabajó antes.",
                "4. Si salió del banco de ideas, `ficha_idea` de la idea de origen: el one-pager ya tiene problema, solución e impacto.",
                "",
                "Después contame en pocas líneas qué encontraste y qué creés que ya está resuelto. **No me preguntes nada que el backoffice ya sepa**: proponé el borrador y pedime que lo corrija.",
                "",
                "**Chequeo de precondiciones.** Antes de entrevistarme, decime si falta algo de esto y qué implica: presupuesto aprobado, contrato o propuesta firmada entre los documentos, monto y moneda acordados, fecha de inicio, y socio responsable. Si falta algo importante, avisámelo — podemos arrancar igual, pero quiero saberlo, no descubrirlo en el mes dos.",
                "",
                "**Entrevista.** De a UNA pregunta por vez, escuchando la respuesta antes de seguir. Para cada campo, proponé primero tu borrador a partir de lo que leíste y pedime que lo ajuste:",
                "1. **Tipo de proyecto**: desarrollo a medida, integración, mantenimiento o interno. Decide las tareas de setup, así que es lo primero.",
                "2. **Objetivo**: qué problema del cliente resuelve y cómo sabremos que valió la pena. Empujá hacia algo medible, no hacia una frase linda.",
                "3. **Alcance**: qué entra — funcionalidades, entregables, integraciones.",
                "4. **Fuera de alcance**: qué NO entra. Insistí con este: es el campo que evita las discusiones del mes tres, y el que todos saltean. Si el alcance quedó vago, señalá qué quedó ambiguo.",
                "5. **Stakeholders**: quién decide del lado del cliente, quién valida entregas, quién da accesos, por qué canal se habla y con qué frecuencia.",
                "6. **Stack y repos**: tecnologías acordadas, repos, y qué convenciones de ZQUARE aplican (códigos US/DEF/SC/TEC, ramas, épicas).",
                "7. **Entornos y accesos**: local, staging y producción; qué credenciales hay que pedir y a quién. Lo que no se pide en la semana uno bloquea en la semana tres.",
                "8. **Riesgos**: qué puede salir mal y qué haríamos. Dependencias del cliente, incógnitas técnicas, plazos apretados. Sé concreto, no genérico.",
                "9. **Definición de hecho**: qué tiene que cumplir una tarjeta para estar hecha en ESTE proyecto (tests, review, deploy, aceptación del cliente).",
                "10. **Hitos**: entregas intermedias con fecha; contra qué se mide el avance y, si aplica, qué se factura.",
                "",
                "Guardá el avance con `actualizar_proyecto` al cerrar cada campo, no todo junto al final: así queda el historial de versiones y si cortamos la charla no se pierde nada.",
                "",
                "**Insumos.** Con el brief cerrado, proponeme (y creá recién cuando yo confirme):",
                "- **Tareas de setup** con `crear_tarea` en `por_hacer`, con `codigo_proyecto` TEC-1, TEC-2… y el proyecto asociado. Salen del tipo de proyecto: repo y estructura estándar, CI, entornos y deploy, pedido de accesos, canal con el cliente y cadencia de reuniones, documento de arranque. Ajustá la lista al proyecto real en vez de copiar una plantilla entera.",
                "- **Primeras historias** con `crear_tarea` en `backlog`, con `codigo_proyecto` US-1, US-2… agrupadas por `epica` (EP-1, EP-2…). Salen del alcance. Cada una con su `contexto` y su `resultado` (criterios verificables) — no títulos sueltos. **No pongas `estimacion`**: los puntos los estima el equipo por consenso, no vos.",
                "- **Decisiones de arranque** con `crear_decision` vinculadas al proyecto: el alcance acordado (con lo que quedó afuera), el stack elegido y por qué, y la cadencia de reuniones. Son las que van a discutirse dentro de tres meses.",
                "",
                "Sé crítico, no un escriba. Si el alcance no cierra con el monto o el plazo acordado, decilo. Si hay algo del brief que nadie puede contestar todavía, dejalo explícito como riesgo en vez de inventarlo. Si el proyecto está vendido pero le falta información básica para arrancar, la conclusión honesta puede ser \"esto no se puede arrancar hasta que el cliente defina X\" — decilo.",
                "",
                `Cuando el brief esté completo, las tareas creadas y yo esté conforme, cerrá con \`comenzar_proyecto\` (la tool): marca el arranque, pasa el proyecto a en_curso y fija la fecha de inicio. Terminá mostrándome el resumen: brief final, tareas creadas con sus códigos, decisiones registradas y qué queda pendiente de definir.`,
              ].join("\n"),
            },
          },
        ],
      })
    )

    // ── Escrituras seguras (solo altas; sin ediciones ni borrados) ─────────
    server.registerTool(
      "crear_decision",
      {
        title: "Registrar una decisión",
        description:
          "Registra una decisión en la bitácora de la empresa. Opcionalmente vinculada a un cliente y/o a un proyecto por nombre — las decisiones de arranque de un proyecto (alcance acordado, stack elegido, cadencia) conviene vincularlas, así aparecen en su ficha cuando alguien las discuta meses después.",
        inputSchema: {
          titulo: z.string().min(3),
          detalle: z.string().optional(),
          participantes: z.array(z.string()).optional(),
          cliente_nombre: z.string().optional(),
          proyecto_nombre: z.string().optional(),
          fecha: z.string().describe("YYYY-MM-DD, default hoy").optional(),
        },
      },
      async (
        { titulo, detalle, participantes, cliente_nombre, proyecto_nombre, fecha },
        extra
      ) => {
        const email = extra.authInfo?.extra?.email as string | undefined
        const socioId = email ? await socioIdPorEmail(email) : null
        const supabase = createAdminClient()

        let clienteId: string | null = null
        if (cliente_nombre) {
          const { data } = await supabase
            .from("clientes")
            .select("id, nombre")
            .is("deleted_at", null)
            .ilike("nombre", `%${cliente_nombre.trim()}%`)
            .limit(1)
            .maybeSingle()
          if (!data) {
            return texto(
              `No encontré el cliente "${cliente_nombre}"; no registré nada. Probá sin cliente o con otro nombre.`
            )
          }
          clienteId = data.id
        }

        // Si la decisión es de un proyecto, hereda su cliente cuando no se
        // pasó uno: no tiene sentido que aparezca en la ficha del proyecto y
        // no en la del cliente que lo paga.
        let proyectoId: string | null = null
        if (proyecto_nombre) {
          const { proyecto, error: noEncontrado } = await proyectoPorNombre(proyecto_nombre)
          if (!proyecto) return texto(`${noEncontrado} No registré nada.`)
          proyectoId = proyecto.id as string
          clienteId ??= (proyecto.cliente_id as string | null) ?? null
        }

        const { data, error } = await supabase
          .from("decisiones")
          .insert({
            titulo,
            detalle: detalle ?? null,
            participantes: participantes ?? [],
            cliente_id: clienteId,
            proyecto_id: proyectoId,
            fecha: fecha ?? undefined,
            created_by: socioId,
          })
          .select("id, fecha, titulo")
          .single()
        if (error) throw new Error(error.message)
        return texto({ registrada: data, ver: CARPETA_DECISIONES })
      }
    )

    server.registerTool(
      "crear_movimiento",
      {
        title: "Registrar un movimiento",
        description:
          "Registra un movimiento financiero (ingreso, gasto, aporte o retiro de socio). tc_a_usd: unidades de la moneda original por 1 USD (USD=1; UYU ej. 40).",
        inputSchema: {
          tipo: z.enum(["ingreso", "gasto", "aporte_socio", "retiro_socio"]),
          monto: z.number().positive(),
          moneda: z.enum(["USD", "UYU"]).optional(),
          tc_a_usd: z.number().positive().optional(),
          fecha: z.string().describe("YYYY-MM-DD, default hoy").optional(),
          categoria: z.string().optional(),
          descripcion: z.string().optional(),
          socio_email: z
            .string()
            .describe("socio del aporte/retiro; default el dueño del token")
            .optional(),
        },
      },
      async (entrada, extra) => {
        const email = extra.authInfo?.extra?.email as string | undefined
        const actorId = email ? await socioIdPorEmail(email) : null
        const socioId = entrada.socio_email
          ? await socioIdPorEmail(entrada.socio_email)
          : actorId
        if (entrada.socio_email && !socioId) {
          return texto(`No encontré un socio con email ${entrada.socio_email}.`)
        }
        if (entrada.moneda === "UYU" && !entrada.tc_a_usd) {
          return texto(
            "Para movimientos en UYU hace falta tc_a_usd (cuántos pesos vale 1 USD ese día)."
          )
        }

        const supabase = createAdminClient()
        const { data, error } = await supabase
          .from("movimientos")
          .insert({
            tipo: entrada.tipo,
            monto: entrada.monto,
            moneda: entrada.moneda ?? "USD",
            tc_a_usd: entrada.tc_a_usd ?? 1,
            fecha: entrada.fecha ?? undefined,
            categoria: entrada.categoria ?? null,
            descripcion: entrada.descripcion ?? null,
            socio_id: socioId,
            created_by: actorId,
            metadata: { origen: "mcp" },
          })
          .select("id, fecha, tipo, monto, moneda, monto_usd")
          .single()
        if (error) throw new Error(error.message)
        return texto({ registrado: data })
      }
    )

    // ── Reuniones ─────────────────────────────────────────────────────────

    server.registerTool(
      "crear_solicitud_reunion",
      {
        title: "Abrir una encuesta de disponibilidad",
        description:
          "Abre una reunión a coordinar: define con quién hay que reunirse y en qué rango de días puede caer. A cada socio requerido le queda pendiente marcar cuándo puede. Después se usan ver_huecos_reunion y agendar_reunion. Las fechas van en formato YYYY-MM-DD.",
        inputSchema: {
          titulo: z.string().min(3),
          desde: z.string().regex(FORMATO_FECHA, "Usar formato YYYY-MM-DD"),
          hasta: z.string().regex(FORMATO_FECHA, "Usar formato YYYY-MM-DD"),
          cliente: z.string().optional(),
          proyecto: z.string().optional(),
          duracion_min: z.union([z.literal(30), z.literal(60)]).optional(),
          socios: z.array(z.string()).optional(),
          invitar_cliente: z.boolean().optional(),
          invitados: z
            .array(z.string())
            .optional()
            .describe("Mails de gente del cliente que recibe la invitación"),
          notas: z.string().optional(),
        },
      },
      async (entrada, extra) => {
        const supabase = createAdminClient()

        // Cuatro lecturas independientes: van juntas.
        const [{ socioId }, requeridos, clienteId, proyectoId] =
          await Promise.all([
            actorMcp(extra),
            sociosRequeridosMcp(entrada.socios),
            idPorNombre("clientes", entrada.cliente),
            idPorNombre("proyectos", entrada.proyecto),
          ])

        if (requeridos.length === 0) {
          return texto("No pude identificar a ningún socio para la reunión.")
        }
        if (entrada.cliente && !clienteId) {
          return texto(`No encontré ningún cliente parecido a "${entrada.cliente}".`)
        }
        if (entrada.proyecto && !proyectoId) {
          return texto(
            `No encontré ningún proyecto parecido a "${entrada.proyecto}".`
          )
        }

        const resultado = await crearSolicitudReunion(
          {
            titulo: entrada.titulo,
            notas: entrada.notas ?? null,
            cliente_id: clienteId ?? null,
            proyecto_id: proyectoId ?? null,
            duracion_min: entrada.duracion_min ?? 30,
            ventana_desde: entrada.desde,
            ventana_hasta: entrada.hasta,
            socios_requeridos: requeridos.map((s) => s.id),
            invitar_cliente: entrada.invitar_cliente ?? true,
            invitados_externos: parsearEmails((entrada.invitados ?? []).join(",")),
            created_by: socioId,
          },
          { supabase }
        )
        if (!resultado.ok) return texto(resultado.error)

        return texto({
          reunion: codigoReunion(resultado.numero),
          url: `/reuniones/${resultado.id}`,
          dias: `${entrada.desde} al ${entrada.hasta}`,
          esperando_respuesta_de: requeridos.map((s) => s.nombre),
        })
      }
    )

    server.registerTool(
      "editar_solicitud_reunion",
      {
        title: "Editar una reunión a coordinar",
        description:
          "Cambia título, días candidatos, duración, socios, cliente/proyecto, invitados o notas de una reunión abierta o ya agendada. Solo hace falta pasar lo que cambia. Si está agendada, el evento de Google se actualiza (título, notas, invitados, duración). Las respuestas ya cargadas se conservan; si se achica la ventana, las franjas que quedan afuera se descartan.",
        inputSchema: {
          reunion: z.union([z.string(), z.number()]),
          titulo: z.string().min(3).optional(),
          desde: z.string().regex(FORMATO_FECHA, "Usar formato YYYY-MM-DD").optional(),
          hasta: z.string().regex(FORMATO_FECHA, "Usar formato YYYY-MM-DD").optional(),
          cliente: z.string().nullable().optional(),
          proyecto: z.string().nullable().optional(),
          duracion_min: z.union([z.literal(30), z.literal(60)]).optional(),
          socios: z.array(z.string()).optional(),
          invitar_cliente: z.boolean().optional(),
          invitados: z
            .array(z.string())
            .optional()
            .describe("Reemplaza la lista de mails externos invitados"),
          notas: z.string().nullable().optional(),
        },
      },
      async (entrada) => {
        const supabase = createAdminClient()
        const solicitud = await solicitudPorReferencia(entrada.reunion, supabase)
        if (!solicitud) return texto(`No encontré la reunión "${entrada.reunion}".`)

        const [requeridos, clienteId, proyectoId] = await Promise.all([
          entrada.socios ? sociosRequeridosMcp(entrada.socios) : null,
          entrada.cliente ? idPorNombre("clientes", entrada.cliente) : null,
          entrada.proyecto ? idPorNombre("proyectos", entrada.proyecto) : null,
        ])
        if (entrada.socios && (!requeridos || requeridos.length === 0)) {
          return texto("No pude identificar a ningún socio para la reunión.")
        }
        if (entrada.cliente && !clienteId) {
          return texto(`No encontré ningún cliente parecido a "${entrada.cliente}".`)
        }
        if (entrada.proyecto && !proyectoId) {
          return texto(`No encontré ningún proyecto parecido a "${entrada.proyecto}".`)
        }

        // null explícito = sacar; undefined = dejar como está.
        const resultado = await editarSolicitudReunion({
          solicitudId: solicitud.id,
          solicitud,
          supabase,
          datos: {
            titulo: entrada.titulo ?? solicitud.titulo,
            notas: entrada.notas === undefined ? solicitud.notas : entrada.notas,
            cliente_id:
              entrada.cliente === undefined
                ? solicitud.cliente_id
                : entrada.cliente === null
                  ? null
                  : clienteId,
            proyecto_id:
              entrada.proyecto === undefined
                ? solicitud.proyecto_id
                : entrada.proyecto === null
                  ? null
                  : proyectoId,
            duracion_min: entrada.duracion_min ?? solicitud.duracion_min,
            ventana_desde: entrada.desde ?? solicitud.ventana_desde,
            ventana_hasta: entrada.hasta ?? solicitud.ventana_hasta,
            socios_requeridos: requeridos
              ? requeridos.map((s) => s.id)
              : solicitud.socios_requeridos,
            invitar_cliente: entrada.invitar_cliente ?? solicitud.invitar_cliente,
            invitados_externos: entrada.invitados
              ? parsearEmails(entrada.invitados.join(","))
              : (solicitud.invitados_externos ?? []),
          },
        })
        if (!resultado.ok) return texto(resultado.error ?? "No se pudo editar.")
        return texto({
          editada: codigoReunion(solicitud.numero),
          advertencia: resultado.advertencia,
        })
      }
    )

    server.registerTool(
      "listar_solicitudes_reunion",
      {
        title: "Reuniones a coordinar",
        description:
          "Lista las reuniones abiertas (esperando disponibilidad), agendadas o canceladas. Con solo_pendientes_mias devuelve solo las que están esperando la respuesta del socio dueño del token.",
        inputSchema: {
          estado: z.enum(["abierta", "agendada", "cancelada"]).optional(),
          solo_pendientes_mias: z.boolean().optional(),
        },
      },
      async ({ estado, solo_pendientes_mias }, extra) => {
        const supabase = createAdminClient()

        if (solo_pendientes_mias) {
          const { socioId } = await actorMcp(extra)
          if (!socioId) {
            return texto("No pude identificar al socio dueño del token.")
          }
          const pendientes = await solicitudesPendientes(socioId, { supabase })
          return texto({
            pendientes: pendientes.map((s) => ({
              reunion: codigoReunion(s.numero),
              titulo: s.titulo,
              dias: `${s.ventana_desde} al ${s.ventana_hasta}`,
              duracion_min: s.duracion_min,
            })),
          })
        }

        let consulta = supabase
          .from("solicitudes_reunion")
          .select(CAMPOS_SOLICITUD)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(30)
        if (estado) consulta = consulta.eq("estado", estado)

        const { data } = await consulta
        const solicitudes = (data ?? []) as SolicitudReunion[]

        return texto({
          reuniones: solicitudes.map((s) => ({
            reunion: codigoReunion(s.numero),
            titulo: s.titulo,
            estado: s.estado,
            dias: `${s.ventana_desde} al ${s.ventana_hasta}`,
            duracion_min: s.duracion_min,
            cuando: s.inicio ? etiquetaHueco({
              inicio: Date.parse(s.inicio),
              fin: Date.parse(s.fin ?? s.inicio),
            }) : null,
            meet_url: s.meet_url,
          })),
        })
      }
    )

    server.registerTool(
      "responder_disponibilidad",
      {
        title: "Marcar cuándo puede el socio",
        description:
          "Registra en qué franjas puede reunirse el socio dueño del token, dentro de los días propuestos. Las horas van en hora de Montevideo ('14:00'). Reemplaza la respuesta anterior. Con no_puedo se avisa que no puede en ninguno de esos días, que es distinto de no haber respondido.",
        inputSchema: {
          reunion: z.union([z.string(), z.number()]),
          franjas: z
            .array(
              z.object({
                fecha: z.string().regex(FORMATO_FECHA, "Usar formato YYYY-MM-DD"),
                desde: z.string().regex(FORMATO_HORA, "Usar formato HH:MM"),
                hasta: z.string().regex(FORMATO_HORA, "Usar formato HH:MM"),
              })
            )
            .optional(),
          no_puedo: z.boolean().optional(),
          comentario: z.string().optional(),
        },
      },
      async ({ reunion, franjas, no_puedo, comentario }, extra) => {
        const supabase = createAdminClient()
        const solicitud = await solicitudPorReferencia(reunion, supabase)
        if (!solicitud) return texto(`No encontré la reunión "${reunion}".`)

        const { socioId } = await actorMcp(extra)
        if (!socioId) {
          return texto("No pude identificar al socio dueño del token.")
        }

        // Sin franjas y sin no_puedo no hay nada que guardar: la lib lo
        // rechaza para que un olvido no se lea como "no puede".
        const resultado = await guardarRespuestaDe({
          solicitudId: solicitud.id,
          socioId,
          franjas: franjas ?? [],
          noPuede: no_puedo === true,
          comentario: comentario ?? null,
          supabase,
          solicitud,
        })
        if (!resultado.ok) return texto(resultado.error ?? "No se pudo guardar.")

        // Si con esta respuesta quedaron todos, se agenda sola.
        const auto = await agendarSiTodosRespondieron({
          solicitudId: solicitud.id,
          organizadorEmail:
            (extra.authInfo?.extra?.email as string | undefined) ?? null,
          organizadorSocioId: socioId,
          supabase,
        })
        if (auto.agendada && auto.inicio) {
          return texto({
            reunion: codigoReunion(solicitud.numero),
            respuesta: "guardada",
            agendada: etiquetaHueco({
              inicio: Date.parse(auto.inicio),
              fin: Date.parse(auto.inicio) + solicitud.duracion_min * 60_000,
            }),
            advertencia: auto.advertencia,
          })
        }

        const resumen = await huecosDeSolicitud(solicitud.id, { supabase })
        return texto({
          reunion: codigoReunion(solicitud.numero),
          respuesta: no_puedo ? "no puede en esos días" : "guardada",
          respondieron: `${resumen?.respondieron} de ${resumen?.requeridos}`,
          faltan:
            resumen?.socios
              .filter((s) => s.estado === "falta")
              .map((s) => s.socio.nombre) ?? [],
          huecos_ahora: resumen?.huecos.length ?? 0,
        })
      }
    )

    server.registerTool(
      "ver_huecos_reunion",
      {
        title: "Huecos en común de una reunión",
        description:
          "Calcula los horarios que le sirven a todos los socios que ya respondieron y que además tienen libres en Google Calendar. Devuelve los huecos con su hora de inicio en formato ISO, que es lo que espera agendar_reunion.",
        inputSchema: { reunion: z.union([z.string(), z.number()]) },
      },
      async ({ reunion }) => {
        const supabase = createAdminClient()
        const solicitud = await solicitudPorReferencia(reunion, supabase)
        if (!solicitud) return texto(`No encontré la reunión "${reunion}".`)

        const resumen = await huecosDeSolicitud(solicitud.id, {
          supabase,
          solicitud,
        })
        if (!resumen) return texto(`No encontré la reunión "${reunion}".`)

        return texto({
          reunion: codigoReunion(solicitud.numero),
          titulo: solicitud.titulo,
          estado: solicitud.estado,
          duracion_min: solicitud.duracion_min,
          dias: `${solicitud.ventana_desde} al ${solicitud.ventana_hasta}`,
          respondieron: `${resumen.respondieron} de ${resumen.requeridos}`,
          faltan: resumen.socios
            .filter((s) => s.estado === "falta")
            .map((s) => s.socio.nombre),
          no_pueden: resumen.socios
            .filter((s) => s.estado === "no_puede")
            .map((s) => s.socio.nombre),
          parcial: resumen.parcial,
          sin_acceso_al_calendario: resumen.sinAcceso,
          huecos: resumen.huecos.map((h) => ({
            cuando: etiquetaHueco(h),
            inicio: new Date(h.inicio).toISOString(),
          })),
        })
      }
    )

    server.registerTool(
      "agendar_reunion",
      {
        title: "Agendar la reunión en un hueco",
        description:
          "Reserva uno de los huecos que devolvió ver_huecos_reunion: crea el evento en Google Calendar con link de Meet e invita a los socios y al cliente. `inicio` es el ISO exacto que vino en el hueco.",
        inputSchema: {
          reunion: z.union([z.string(), z.number()]),
          inicio: z.string(),
        },
      },
      async ({ reunion, inicio }, extra) => {
        const supabase = createAdminClient()
        const solicitud = await solicitudPorReferencia(reunion, supabase)
        if (!solicitud) return texto(`No encontré la reunión "${reunion}".`)

        const email = extra.authInfo?.extra?.email as string | undefined
        const { socioId } = await actorMcp(extra)
        if (!email) {
          return texto("No pude identificar la cuenta del socio para organizar.")
        }

        const resultado = await agendarSolicitud({
          solicitudId: solicitud.id,
          inicioIso: inicio,
          organizadorEmail: email,
          organizadorSocioId: socioId,
          supabase,
          solicitud,
        })

        if (!resultado.ok) return texto(resultado.error ?? "No se pudo agendar.")
        return texto({
          agendada: codigoReunion(solicitud.numero),
          cuando: resultado.inicio
            ? etiquetaHueco({
                inicio: Date.parse(resultado.inicio),
                fin:
                  Date.parse(resultado.inicio) +
                  solicitud.duracion_min * 60_000,
              })
            : null,
          meet_url: resultado.meetUrl ?? null,
          advertencia: resultado.advertencia,
        })
      }
    )

    server.registerTool(
      "cancelar_reunion",
      {
        title: "Cancelar una reunión",
        description:
          "Cancela la reunión y borra el evento de Google Calendar si ya estaba agendada, avisando a los invitados.",
        inputSchema: {
          reunion: z.union([z.string(), z.number()]),
          motivo: z.string().optional(),
        },
      },
      async ({ reunion, motivo }) => {
        const supabase = createAdminClient()
        const solicitud = await solicitudPorReferencia(reunion, supabase)
        if (!solicitud) return texto(`No encontré la reunión "${reunion}".`)

        const resultado = await cancelarSolicitud({
          solicitudId: solicitud.id,
          motivo: motivo ?? null,
          supabase,
          solicitud,
        })
        if (!resultado.ok) return texto(resultado.error ?? "No se pudo cancelar.")
        return texto({
          cancelada: codigoReunion(solicitud.numero),
          evento_calendario: solicitud.google_event_id
            ? resultado.advertencia
              ? "no se pudo borrar"
              : "borrado"
            : "no había",
          advertencia: resultado.advertencia,
        })
      }
    )

    server.registerTool(
      "transcripcion_reunion",
      {
        title: "Transcripción de una reunión",
        description:
          "Devuelve la transcripción de una reunión grabada desde el backoffice (Whisper), con el link al Google Doc en Drive y el estado de cada parte de audio. Sirve para resumir la reunión, sacar acuerdos o crear tareas y decisiones a partir de lo hablado.",
        inputSchema: { reunion: z.union([z.string(), z.number()]) },
      },
      async ({ reunion }) => {
        const supabase = createAdminClient()
        const solicitud = await solicitudPorReferencia(reunion, supabase)
        if (!solicitud) return texto(`No encontré la reunión "${reunion}".`)

        const partes = await listarGrabaciones(supabase, solicitud.id)
        if (partes.length === 0) {
          return texto(
            `La reunión ${codigoReunion(solicitud.numero)} no tiene grabaciones. Se graba desde su página en el backoffice (/reuniones/${solicitud.id}).`
          )
        }

        return texto({
          reunion: codigoReunion(solicitud.numero),
          titulo: solicitud.titulo,
          documento_drive: solicitud.drive_transcripcion_url,
          partes: partes.map((p) => ({
            parte: p.parte,
            estado: p.estado,
            error: p.error ?? undefined,
          })),
          transcripcion: partes
            .filter((p) => p.estado === "transcripta" && p.texto)
            .map((p) =>
              partes.length > 1 ? `— Parte ${p.parte} —\n${p.texto}` : p.texto
            )
            .join("\n\n")
            // Techo defensivo para no reventar el contexto del cliente MCP.
            .slice(0, 150_000),
        })
      }
    )
  },
  {},
  { basePath: "/api/mcp", maxDuration: 60, disableSse: true }
)

// Autenticación: token estático (MCP_TOKENS) u OAuth (mcp_oauth_tokens).
// Sin token válido → 401 con WWW-Authenticate apuntando al discovery, que es
// lo que dispara el flujo OAuth en claude.ai.
const handlerConAuth = withMcpAuth(
  handler,
  async (_req, bearer) => {
    if (!bearer) return undefined
    const email = socioDelToken(bearer) ?? (await socioDelAccessToken(bearer))
    if (!email) return undefined
    return {
      token: bearer,
      clientId: email,
      scopes: ["backoffice"],
      extra: { email },
    }
  },
  { required: true }
)

export { handlerConAuth as GET, handlerConAuth as POST }

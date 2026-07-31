import { createMcpHandler, withMcpAuth } from "mcp-handler"
import { z } from "zod"

import { generarEmbeddings } from "@/lib/embeddings"
import { socioDelAccessToken } from "@/lib/mcp-oauth"
import { createAdminClient } from "@/lib/supabase/admin"

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
] as const

// Brief de desarrollo: si los cuatro están vacíos, la tarjeta está "sin
// desarrollar" y conviene pasarla por el prompt `desarrollar_tarea`.
const CAMPOS_BRIEF = ["contexto", "resultado", "recursos", "plan"] as const

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

    // ── Tablero de tareas ─────────────────────────────────────────────────
    // A diferencia del resto, acá sí hay ediciones: el tablero está pensado
    // para que un agente lo opere (crear, mover, comentar). El borrado sigue
    // siendo solo de la UI.
    server.registerTool(
      "listar_tareas",
      {
        title: "Listar tareas del tablero",
        description:
          "Tarjetas del tablero de la empresa, agrupadas por columna. 'backlog' es la lista priorizada fuera del tablero (ideas sin comprometer); el tablero va de 'por_hacer' a 'hecho'. Por defecto omite las que están en 'hecho'. `desarrollada` indica si la tarjeta tiene definido su resultado esperado, que es lo que la vuelve resoluble: las que no (típicamente las recién creadas o las que salen de graduar una idea, que traen contexto pero no criterios) necesitan una pasada por el prompt `desarrollar_tarea` antes de que un agente las resuelva. El brief completo se ve con `ficha_tarea`.",
        inputSchema: {
          estado: z.enum(ESTADOS_TAREA).optional(),
          asignado_email: z.string().optional(),
          cliente_nombre: z.string().optional(),
          proyecto_nombre: z.string().optional(),
          incluir_hechas: z.boolean().optional(),
          limite: z.number().int().min(1).max(200).optional(),
        },
      },
      async ({
        estado,
        asignado_email,
        cliente_nombre,
        proyecto_nombre,
        incluir_hechas,
        limite,
      }) => {
        const supabase = createAdminClient()
        let q = supabase
          .from("tareas")
          .select(
            // `tareas` tiene dos FK a socios (asignado_a y created_by): sin el
            // hint del constraint, PostgREST no sabe cuál embeber.
            "numero, titulo, descripcion, contexto, resultado, recursos, plan, estado, prioridad, etiquetas, fecha_limite, orden, asignado:socios!tareas_asignado_a_fkey(nombre, email), clientes(nombre), proyectos(nombre)"
          )
          .is("deleted_at", null)
          .order("estado")
          .order("orden")
          .limit(limite ?? 100)

        if (estado) q = q.eq("estado", estado)
        else if (!incluir_hechas) q = q.neq("estado", "hecho")

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
          const { numero, orden, contexto, resultado, recursos, plan, ...resto } = t
          void orden
          void contexto
          void recursos
          void plan
          // Desarrollada = tiene `resultado`. Tener contexto no alcanza: es el
          // resultado lo que la vuelve verificable (ver dominio.ts).
          const desarrollada = Boolean(resultado)
          ;(porColumna[t.estado] ??= []).push({
            codigo: `ZQ-${numero}`,
            desarrollada,
            ...resto,
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
            "id, numero, titulo, descripcion, contexto, resultado, recursos, plan, estado, prioridad, etiquetas, fecha_limite, created_at, updated_at, asignado:socios!tareas_asignado_a_fkey(nombre, email), clientes(nombre), proyectos(nombre)"
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
          "Crea una tarjeta. Entra arriba de su columna (por defecto 'backlog', la lista de ideas fuera del tablero; usá 'por_hacer' para que entre directo al tablero). Cliente y proyecto se resuelven por nombre aproximado. Alcanza con el título: el brief (contexto/resultado/recursos/plan) se completa después con el prompt `desarrollar_tarea`.",
        inputSchema: {
          titulo: z.string().min(3),
          descripcion: z.string().optional(),
          estado: z.enum(ESTADOS_TAREA).optional(),
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

        const estado = entrada.estado ?? "backlog"
        const supabase = createAdminClient()
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
        }
        const { data, error } = await supabase
          .from("tareas")
          .insert({
            ...contenido,
            asignado_a: asignadoId,
            cliente_id: clienteId ?? null,
            proyecto_id: proyectoId ?? null,
            orden: await ordenAlTopeDeColumna(estado),
            created_by: actorId,
            metadata: { origen: "mcp" },
          })
          .select("id, numero, titulo, estado, prioridad")
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
          "Cambia campos de una tarjeta existente, incluido su brief de desarrollo (contexto / resultado / recursos / plan). Solo se tocan los campos que se pasan; string vacío limpia el campo (y desvincula cliente/proyecto/responsable). Cada edición queda en el historial de versiones.",
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
        },
      },
      async (entrada, extra) => {
        const numero = numeroDeTarea(entrada.tarea)
        if (!numero) return texto(`"${entrada.tarea}" no parece un número de tarjeta.`)

        const supabase = createAdminClient()
        const { data: actual } = await supabase
          .from("tareas")
          .select("id, estado")
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

        if (entrada.estado !== undefined && entrada.estado !== actual.estado) {
          cambios.estado = entrada.estado
          cambios.orden = await ordenAlTopeDeColumna(entrada.estado)
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
        const { data, error } = await supabase
          .from("tareas")
          .update({ estado, orden: await ordenAlTopeDeColumna(estado) })
          .eq("numero", numero)
          .is("deleted_at", null)
          .select("numero, titulo, estado")
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

    // ── Escrituras seguras (solo altas; sin ediciones ni borrados) ─────────
    server.registerTool(
      "crear_decision",
      {
        title: "Registrar una decisión",
        description:
          "Registra una decisión en la bitácora de la empresa. Opcionalmente vinculada a un cliente por nombre.",
        inputSchema: {
          titulo: z.string().min(3),
          detalle: z.string().optional(),
          participantes: z.array(z.string()).optional(),
          cliente_nombre: z.string().optional(),
          fecha: z.string().describe("YYYY-MM-DD, default hoy").optional(),
        },
      },
      async ({ titulo, detalle, participantes, cliente_nombre, fecha }, extra) => {
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

        const { data, error } = await supabase
          .from("decisiones")
          .insert({
            titulo,
            detalle: detalle ?? null,
            participantes: participantes ?? [],
            cliente_id: clienteId,
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

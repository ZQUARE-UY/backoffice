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

// Las tarjetas se referencian por número ("ZQ-12" o 12): es el identificador
// corto que ven los socios en el tablero.
function numeroDeTarea(referencia: string | number): number | null {
  const n = Number(String(referencia).replace(/^zq-?/i, "").trim())
  return Number.isInteger(n) && n > 0 ? n : null
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
          "Busca clientes, proyectos, documentos y tarjetas del tablero por nombre (literal) y contenido de documentos de Drive y decisiones (semántico, multilingüe).",
        inputSchema: { consulta: z.string().min(2) },
      },
      async ({ consulta }) => {
        const supabase = createAdminClient()
        const like = `%${consulta.replace(/[(),*%_]/g, " ").trim()}%`
        const [clientes, proyectos, documentos, tareas] = await Promise.all([
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
          "Tarjetas del tablero de la empresa, agrupadas por columna. 'backlog' es la lista priorizada fuera del tablero (ideas sin comprometer); el tablero va de 'por_hacer' a 'hecho'. Por defecto omite las que están en 'hecho'.",
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
            "numero, titulo, descripcion, estado, prioridad, etiquetas, fecha_limite, orden, asignado:socios!tareas_asignado_a_fkey(nombre, email), clientes(nombre), proyectos(nombre)"
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
          const { numero, orden, ...resto } = t
          void orden
          ;(porColumna[t.estado] ??= []).push({ codigo: `ZQ-${numero}`, ...resto })
        }
        return texto({ columnas: porColumna })
      }
    )

    server.registerTool(
      "ficha_tarea",
      {
        title: "Ficha de una tarjeta",
        description:
          "Detalle completo de una tarjeta del tablero, con sus comentarios. Se identifica por número o código (12 o ZQ-12).",
        inputSchema: { tarea: z.union([z.string(), z.number()]) },
      },
      async ({ tarea }) => {
        const numero = numeroDeTarea(tarea)
        if (!numero) return texto(`"${tarea}" no parece un número de tarjeta (ej. ZQ-12).`)

        const supabase = createAdminClient()
        const { data } = await supabase
          .from("tareas")
          .select(
            "id, numero, titulo, descripcion, estado, prioridad, etiquetas, fecha_limite, created_at, updated_at, asignado:socios!tareas_asignado_a_fkey(nombre, email), clientes(nombre), proyectos(nombre)"
          )
          .eq("numero", numero)
          .is("deleted_at", null)
          .maybeSingle()
        if (!data) return texto(`No existe la tarjeta ZQ-${numero}.`)

        const { data: comentarios } = await supabase
          .from("tareas_comentarios")
          .select("autor, cuerpo, created_at")
          .eq("tarea_id", data.id)
          .is("deleted_at", null)
          .order("created_at")

        const { id, ...tarjeta } = data
        void id
        return texto({
          tarjeta: { codigo: `ZQ-${data.numero}`, ...tarjeta },
          comentarios: comentarios ?? [],
        })
      }
    )

    server.registerTool(
      "crear_tarea",
      {
        title: "Crear una tarjeta",
        description:
          "Crea una tarjeta. Entra arriba de su columna (por defecto 'backlog', la lista de ideas fuera del tablero; usá 'por_hacer' para que entre directo al tablero). Cliente y proyecto se resuelven por nombre aproximado.",
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
        },
      },
      async (entrada, extra) => {
        const email = extra.authInfo?.extra?.email as string | undefined
        const actorId = email ? await socioIdPorEmail(email) : null

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
        const { data, error } = await supabase
          .from("tareas")
          .insert({
            titulo: entrada.titulo,
            descripcion: entrada.descripcion ?? null,
            estado,
            prioridad: entrada.prioridad ?? "media",
            asignado_a: asignadoId,
            cliente_id: clienteId ?? null,
            proyecto_id: proyectoId ?? null,
            etiquetas: entrada.etiquetas ?? [],
            fecha_limite: entrada.fecha_limite ?? null,
            orden: await ordenAlTopeDeColumna(estado),
            created_by: actorId,
            metadata: { origen: "mcp" },
          })
          .select("numero, titulo, estado, prioridad")
          .single()
        if (error) throw new Error(error.message)
        return texto({ creada: { codigo: `ZQ-${data.numero}`, ...data }, ver: "/tareas" })
      }
    )

    server.registerTool(
      "actualizar_tarea",
      {
        title: "Actualizar una tarjeta",
        description:
          "Cambia campos de una tarjeta existente. Solo se tocan los campos que se pasan. Para cliente/proyecto/responsable, pasar string vacío desvincula.",
        inputSchema: {
          tarea: z.union([z.string(), z.number()]),
          titulo: z.string().min(3).optional(),
          descripcion: z.string().optional(),
          estado: z.enum(ESTADOS_TAREA).optional(),
          prioridad: z.enum(PRIORIDADES_TAREA).optional(),
          asignado_email: z.string().optional(),
          cliente_nombre: z.string().optional(),
          proyecto_nombre: z.string().optional(),
          etiquetas: z.array(z.string()).optional(),
          fecha_limite: z.string().describe("YYYY-MM-DD").optional(),
        },
      },
      async (entrada) => {
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
          .select("numero, titulo, estado, prioridad")
          .single()
        if (error) throw new Error(error.message)
        return texto({ actualizada: { codigo: `ZQ-${data.numero}`, ...data } })
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

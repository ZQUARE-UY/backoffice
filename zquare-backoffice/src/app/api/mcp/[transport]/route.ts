import { createMcpHandler, withMcpAuth } from "mcp-handler"
import { z } from "zod"

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

// Embeddings de la consulta vía la Edge Function (autenticada con la service key).
async function embeddingConsulta(consulta: string): Promise<number[] | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/embeddings`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ textos: [consulta] }),
      }
    )
    if (!res.ok) return null
    return (await res.json()).embeddings[0] as number[]
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
          "Busca clientes, proyectos y documentos por nombre (literal) y contenido de documentos de Drive y decisiones (semántico). Nota: el ranking semántico en español es aproximado.",
        inputSchema: { consulta: z.string().min(2) },
      },
      async ({ consulta }) => {
        const supabase = createAdminClient()
        const like = `%${consulta.replace(/[(),*%_]/g, " ").trim()}%`
        const [clientes, proyectos, documentos] = await Promise.all([
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
          "Devuelve la ficha completa de un cliente (por nombre, no hace falta exacto): proyectos, presupuestos, documentos, decisiones y movimientos asociados.",
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

        const [proyectos, presupuestos, documentos, decisiones, movimientos] =
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
          ])

        return texto({
          cliente,
          proyectos: proyectos.data ?? [],
          presupuestos: presupuestos.data ?? [],
          documentos: documentos.data ?? [],
          decisiones: decisiones.data ?? [],
          movimientos: movimientos.data ?? [],
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

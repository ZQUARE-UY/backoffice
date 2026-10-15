import { codigoSprint, codigoTarea, formatearMonto } from "@/lib/dominio"
import { hoyUruguay } from "@/lib/finanzas"
import { diasHasta, fechaCorta, fechaRelativa, vencimiento } from "@/lib/formato"
import { createClient } from "@/lib/supabase/server"

// Notificaciones del panel lateral (campanita). No hay tabla de
// notificaciones: se derivan de lo que pasó en la base en los últimos días,
// así siempre son datos reales. Qué leyó cada socio se guarda en su navegador
// (ver panel-notificaciones.tsx) con el `id` de cada una, que es estable.

export type GrupoNotificacion = "proyectos" | "decisiones" | "tareas" | "finanzas"

export type Notificacion = {
  id: string
  grupo: GrupoNotificacion
  texto: string
  detalle: string
  href: string
  // Para ordenar dentro del grupo (más nueva arriba).
  orden: string
}

const VENTANA_DIAS = 14

function haceDias(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

export async function notificacionesRecientes(
  socioId: string | null
): Promise<Notificacion[]> {
  const supabase = await createClient()
  const hoy = hoyUruguay()
  const desde = haceDias(VENTANA_DIAS)

  const [socios, proyectos, decisiones, tareas, sprint, movimientos] = await Promise.all([
    supabase.from("socios").select("id, nombre").is("deleted_at", null),
    supabase
      .from("proyectos")
      .select("id, nombre, estado, fecha_fin_estimada, created_at, created_by, clientes(nombre)")
      .in("estado", ["propuesta", "en_curso"])
      .is("deleted_at", null),
    supabase
      .from("decisiones")
      .select("id, titulo, fecha, created_at, created_by")
      .gte("created_at", desde)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10),
    socioId
      ? supabase
          .from("tareas")
          .select("id, numero, titulo, fecha_limite")
          .eq("asignado_a", socioId)
          .neq("estado", "hecho")
          .not("fecha_limite", "is", null)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("sprints")
      .select("id, numero, fecha_fin")
      .eq("estado", "activo")
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("movimientos")
      .select("id, tipo, monto, moneda, descripcion, categoria, created_at, created_by")
      .gte("created_at", desde)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ])

  const nombres = new Map(
    ((socios.data ?? []) as { id: string; nombre: string }[]).map((s) => [s.id, s.nombre.split(" ")[0]])
  )
  const autor = (id: string | null) => (id && nombres.get(id)) || null
  const lista: Notificacion[] = []

  type FilaProyecto = {
    id: string
    nombre: string
    estado: string
    fecha_fin_estimada: string | null
    created_at: string
    created_by: string | null
    clientes: { nombre: string } | null
  }
  for (const p of (proyectos.data ?? []) as unknown as FilaProyecto[]) {
    const href = `/proyectos/${p.id}`
    if (p.estado === "en_curso" && p.fecha_fin_estimada) {
      const n = diasHasta(p.fecha_fin_estimada, hoy)
      if (n >= -VENTANA_DIAS && n <= 7) {
        lista.push({
          id: `proyecto-fin:${p.id}:${p.fecha_fin_estimada}`,
          grupo: "proyectos",
          texto:
            n < 0
              ? `${p.nombre}: la entrega estimada ya pasó`
              : `${p.nombre} entrega ${fechaRelativa(p.fecha_fin_estimada, hoy).toLowerCase()}`,
          detalle: [p.clientes?.nombre, fechaCorta(p.fecha_fin_estimada, hoy)].filter(Boolean).join(" · "),
          href,
          orden: p.fecha_fin_estimada,
        })
      }
    }
    if (p.created_at >= desde) {
      lista.push({
        id: `proyecto-nuevo:${p.id}`,
        grupo: "proyectos",
        texto: `Nuevo proyecto: ${p.nombre}`,
        detalle: [autor(p.created_by), fechaCorta(p.created_at, hoy)].filter(Boolean).join(" · "),
        href,
        orden: p.created_at,
      })
    }
  }

  type FilaDecision = { id: string; titulo: string; fecha: string; created_at: string; created_by: string | null }
  for (const d of (decisiones.data ?? []) as FilaDecision[]) {
    lista.push({
      id: `decision:${d.id}`,
      grupo: "decisiones",
      texto: d.titulo,
      detalle: [autor(d.created_by), fechaCorta(d.fecha, hoy)].filter(Boolean).join(" · "),
      href: "/decisiones",
      orden: d.created_at,
    })
  }

  const s = sprint.data as { id: string; numero: number; fecha_fin: string | null } | null
  if (s?.fecha_fin && diasHasta(s.fecha_fin, hoy) < 0) {
    lista.push({
      id: `sprint-vencido:${s.id}`,
      grupo: "tareas",
      texto: `${codigoSprint(s.numero)} terminó y sigue abierto`,
      detalle: vencimiento(s.fecha_fin, hoy),
      href: "/tareas",
      orden: s.fecha_fin,
    })
  }

  type FilaTarea = { id: string; numero: number; titulo: string; fecha_limite: string }
  for (const t of (tareas.data ?? []) as FilaTarea[]) {
    const n = diasHasta(t.fecha_limite, hoy)
    if (n > 3) continue
    const codigo = codigoTarea(t.numero)
    lista.push({
      id: `tarea-vence:${t.id}:${t.fecha_limite}`,
      grupo: "tareas",
      texto: `${codigo} · ${t.titulo}`,
      detalle: vencimiento(t.fecha_limite, hoy),
      href: `/tareas?tarea=${codigo}`,
      orden: t.fecha_limite,
    })
  }

  type FilaMovimiento = {
    id: string
    tipo: string
    monto: number
    moneda: string
    descripcion: string | null
    categoria: string | null
    created_at: string
    created_by: string | null
  }
  const TIPOS: Record<string, string> = {
    ingreso: "Cobro",
    gasto: "Gasto",
    aporte_socio: "Aporte",
    retiro_socio: "Retiro",
  }
  for (const m of (movimientos.data ?? []) as FilaMovimiento[]) {
    // Lo que cargó uno mismo no es novedad.
    if (socioId && m.created_by === socioId) continue
    const que = m.descripcion || m.categoria
    lista.push({
      id: `movimiento:${m.id}`,
      grupo: "finanzas",
      texto: `${TIPOS[m.tipo] ?? "Movimiento"}${que ? ` ${que}` : ""}, ${formatearMonto(Number(m.monto), m.moneda)}`,
      detalle: [autor(m.created_by), fechaCorta(m.created_at, hoy)].filter(Boolean).join(" · "),
      href: "/finanzas",
      orden: m.created_at,
    })
  }

  return lista.sort((a, b) => (a.orden < b.orden ? 1 : -1))
}

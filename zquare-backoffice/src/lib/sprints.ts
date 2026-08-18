import { type SupabaseClient } from "@supabase/supabase-js"

import {
  codigoSprint,
  ESTADOS_TAREA_ORDEN,
  type EstadoSprint,
  type EstadoTarea,
  type Sprint,
} from "@/lib/dominio"

// Lógica de sprints compartida por las server actions (cliente con RLS del
// socio) y el MCP (cliente admin): las reglas de coherencia entre `estado` y
// `sprint_id` tienen que ser una sola, se mueva la tarjeta desde donde se
// mueva.
//
// Reglas (estilo Jira, adaptadas al backlog separado del tablero):
// - Sprint activo ⇒ sus tarjetas están en el tablero (`por_hacer`..`hecho`).
// - Sprint planificado ⇒ sus tarjetas están en `backlog` (se ven en la vista
//   Backlog agrupadas bajo el sprint); al iniciarlo pasan a `por_hacer`.
// - Sprint cerrado ⇒ no se le agregan tarjetas.
// - Una tarjeta que entra al tablero sin sprint, habiendo uno activo, se suma
//   al activo (como crear un issue desde el board en Jira).
// - Una tarjeta del sprint activo que se manda a `backlog` sale del sprint.

// Cualquiera de los dos clientes de Supabase del proyecto (sin tipos
// generados: la base se describe a mano en dominio.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, any, any>

export type SprintResumen = Pick<Sprint, "id" | "numero" | "nombre" | "estado">

export async function sprintActivo(db: Db): Promise<SprintResumen | null> {
  const { data } = await db
    .from("sprints")
    .select("id, numero, nombre, estado")
    .eq("estado", "activo")
    .is("deleted_at", null)
    .maybeSingle()
  return (data as SprintResumen | null) ?? null
}

export async function sprintPorId(db: Db, id: string): Promise<SprintResumen | null> {
  const { data } = await db
    .from("sprints")
    .select("id, numero, nombre, estado")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle()
  return (data as SprintResumen | null) ?? null
}

// Referencia en lenguaje natural: "3", "Sprint 3", "sprint-3", "S3".
export function numeroDeSprint(referencia: string | number): number | null {
  const n =
    typeof referencia === "number"
      ? referencia
      : Number(String(referencia).trim().replace(/^s(print)?[\s-]*/i, ""))
  return Number.isInteger(n) && n > 0 ? n : null
}

export async function sprintPorNumero(
  db: Db,
  numero: number
): Promise<SprintResumen | null> {
  const { data } = await db
    .from("sprints")
    .select("id, numero, nombre, estado")
    .eq("numero", numero)
    .is("deleted_at", null)
    .maybeSingle()
  return (data as SprintResumen | null) ?? null
}

// `orden` es numeric: entrar al tope de una columna es "uno menos que el
// mínimo" y toca una sola fila.
export async function ordenAlTope(db: Db, estado: string): Promise<number> {
  const { data } = await db
    .from("tareas")
    .select("orden")
    .eq("estado", estado)
    .is("deleted_at", null)
    .order("orden", { ascending: true })
    .limit(1)
    .maybeSingle()
  return Number(data?.orden ?? 0) - 1
}

export type Ubicacion = { estado: string; sprint_id: string | null }

// Devuelve dónde tiene que quedar una tarjeta para que `estado` y `sprint_id`
// sean coherentes. `gana` dice cuál de los dos es la intención del usuario
// cuando chocan: si eligió un sprint, el estado se acomoda al sprint; si
// eligió una columna, el sprint se acomoda a la columna.
export async function ubicacionCoherente(
  db: Db,
  deseada: Ubicacion,
  gana: "estado" | "sprint"
): Promise<Ubicacion> {
  const activo = await sprintActivo(db)
  const enTablero = deseada.estado !== "backlog"

  if (!deseada.sprint_id) {
    // Sin sprint: al tablero solo se entra por el sprint activo, si lo hay.
    return { estado: deseada.estado, sprint_id: enTablero ? (activo?.id ?? null) : null }
  }

  const sprint =
    activo && activo.id === deseada.sprint_id
      ? activo
      : await sprintPorId(db, deseada.sprint_id)
  if (!sprint) throw new Error("El sprint no existe")

  switch (sprint.estado as EstadoSprint) {
    case "cerrado":
      if (gana === "sprint") {
        throw new Error(
          `${codigoSprint(sprint.numero)} está cerrado: no se le agregan tarjetas`
        )
      }
      // Se cambió la columna de una tarjeta archivada en un sprint cerrado
      // (p. ej. reabrirla): sale del sprint como si no tuviera.
      return ubicacionCoherente(db, { estado: deseada.estado, sprint_id: null }, gana)
    case "activo":
      if (enTablero) return deseada
      // Sprint activo + backlog: o entra al tablero, o sale del sprint.
      return gana === "sprint"
        ? { estado: "por_hacer", sprint_id: sprint.id }
        : { estado: "backlog", sprint_id: null }
    case "planificado":
      if (!enTablero) return deseada
      // Sprint planificado + tablero: o vuelve al backlog dentro del sprint,
      // o entra al tablero (y por lo tanto al sprint activo, si lo hay).
      return gana === "sprint"
        ? { estado: "backlog", sprint_id: sprint.id }
        : { estado: deseada.estado, sprint_id: activo?.id ?? null }
  }
}

// Mueve tarjetas a una columna conservando su orden relativo, todas al tope
// (la primera de la lista queda primera). Devuelve cuántas movió.
export async function moverAlTopeEnOrden(
  db: Db,
  tarjetas: { id: string }[],
  destino: Ubicacion
): Promise<number> {
  if (tarjetas.length === 0) return 0
  const tope = await ordenAlTope(db, destino.estado)
  const resultados = await Promise.all(
    tarjetas.map((t, i) =>
      db
        .from("tareas")
        .update({ ...destino, orden: tope - (tarjetas.length - 1 - i) })
        .eq("id", t.id)
    )
  )
  const error = resultados.find((r) => r.error)?.error
  if (error) throw new Error(error.message)
  return tarjetas.length
}

// Agrega (o saca, con `sprintId` null) una tarjeta a un sprint, acomodando la
// columna: al activo entra al tablero, a un planificado queda en backlog, y
// salir de un sprint la deja en el backlog libre.
export async function moverTarjetaASprint(
  db: Db,
  tareaId: string,
  sprintId: string | null
): Promise<Ubicacion> {
  const { data: actual } = await db
    .from("tareas")
    .select("estado, sprint_id")
    .eq("id", tareaId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!actual) throw new Error("La tarjeta no existe")

  let destino: Ubicacion
  if (sprintId) {
    destino = await ubicacionCoherente(
      db,
      { estado: actual.estado, sprint_id: sprintId },
      "sprint"
    )
  } else {
    // "Quitar del sprint": vuelve al backlog libre (Jira hace lo mismo al
    // sacar un issue del sprint activo).
    destino = { estado: "backlog", sprint_id: null }
  }

  const cambios: Record<string, unknown> = { ...destino }
  if (destino.estado !== actual.estado) {
    cambios.orden = await ordenAlTope(db, destino.estado)
  }
  const { error } = await db.from("tareas").update(cambios).eq("id", tareaId)
  if (error) throw new Error(error.message)
  return destino
}

// Iniciar un sprint: pasa a activo (la base garantiza que sea el único) y sus
// tarjetas entran al tope de Por hacer conservando la prioridad del backlog.
export async function iniciarSprint(
  db: Db,
  sprintId: string,
  fechas: { fecha_inicio: string | null; fecha_fin: string | null }
): Promise<{ sprint: SprintResumen; tarjetas: number }> {
  const sprint = await sprintPorId(db, sprintId)
  if (!sprint) throw new Error("El sprint no existe")
  if (sprint.estado !== "planificado") {
    throw new Error(`${codigoSprint(sprint.numero)} ya está ${sprint.estado}`)
  }
  const activo = await sprintActivo(db)
  if (activo) {
    throw new Error(
      `Ya hay un sprint activo (${codigoSprint(activo.numero)}). Completalo antes de iniciar otro.`
    )
  }

  const { data: sprintActualizado, error } = await db
    .from("sprints")
    .update({
      estado: "activo",
      iniciado_at: new Date().toISOString(),
      fecha_inicio: fechas.fecha_inicio,
      fecha_fin: fechas.fecha_fin,
    })
    .eq("id", sprintId)
    .select("id, numero, nombre, estado")
    .single()
  if (error) throw new Error(error.message)

  const { data: tarjetas } = await db
    .from("tareas")
    .select("id")
    .eq("sprint_id", sprintId)
    .eq("estado", "backlog")
    .is("deleted_at", null)
    .order("orden", { ascending: true })
  const movidas = await moverAlTopeEnOrden(db, tarjetas ?? [], {
    estado: "por_hacer",
    sprint_id: sprintId,
  })
  return { sprint: sprintActualizado as SprintResumen, tarjetas: movidas }
}

export type DestinoPendientes = { tipo: "backlog" } | { tipo: "sprint"; sprint_id: string }

// Completar un sprint: lo hecho queda archivado en el sprint (deja de verse
// en el tablero) y lo pendiente vuelve al backlog o pasa a otro sprint
// planificado, conservando el orden del tablero. Devuelve el resumen que
// también queda en `metadata`.
export async function completarSprint(
  db: Db,
  sprintId: string,
  destino: DestinoPendientes
): Promise<{
  sprint: SprintResumen
  hechas: number
  pendientes: number
  puntos_hechos: number
  pendientes_a: string
}> {
  const sprint = await sprintPorId(db, sprintId)
  if (!sprint) throw new Error("El sprint no existe")
  if (sprint.estado !== "activo") {
    throw new Error(`${codigoSprint(sprint.numero)} no está activo`)
  }

  let sprintDestino: SprintResumen | null = null
  if (destino.tipo === "sprint") {
    sprintDestino = await sprintPorId(db, destino.sprint_id)
    if (!sprintDestino || sprintDestino.estado !== "planificado") {
      throw new Error("El sprint destino tiene que estar planificado")
    }
  }

  const { data: tarjetas } = await db
    .from("tareas")
    .select("id, estado, estimacion")
    .eq("sprint_id", sprintId)
    .is("deleted_at", null)
    .order("orden", { ascending: true })
  const todas = (tarjetas ?? []) as { id: string; estado: string; estimacion: number | null }[]
  const hechas = todas.filter((t) => t.estado === "hecho")
  // Orden del tablero: la columna más avanzada primero y dentro de cada una su
  // posición, para que en el destino queden priorizadas como estaban.
  const rango = (estado: string) => ESTADOS_TAREA_ORDEN.indexOf(estado as EstadoTarea)
  const pendientes = todas
    .filter((t) => t.estado !== "hecho")
    .sort((a, b) => rango(b.estado) - rango(a.estado))

  await moverAlTopeEnOrden(db, pendientes, {
    estado: "backlog",
    sprint_id: sprintDestino?.id ?? null,
  })

  const resumen = {
    hechas: hechas.length,
    pendientes: pendientes.length,
    puntos_hechos: hechas.reduce((s, t) => s + (t.estimacion ?? 0), 0),
    pendientes_a: sprintDestino ? codigoSprint(sprintDestino.numero) : "backlog",
  }
  const { data: cerrado, error } = await db
    .from("sprints")
    .update({
      estado: "cerrado",
      cerrado_at: new Date().toISOString(),
      metadata: { resumen },
    })
    .eq("id", sprintId)
    .select("id, numero, nombre, estado")
    .single()
  if (error) throw new Error(error.message)
  return { sprint: cerrado as SprintResumen, ...resumen }
}

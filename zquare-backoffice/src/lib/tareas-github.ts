import "server-only"

import {
  actualizarIssue,
  asegurarLabels,
  comentarIssue,
  crearIssue,
  githubConfigurado,
} from "@/lib/github"
import { createAdminClient } from "@/lib/supabase/admin"

// Espejo de una tarjeta en una issue de GitHub (una sola dirección). Idempotente:
// si la tarjeta no tiene issue la crea, si la tiene la actualiza. La usa tanto la
// UI (server actions) como el endpoint MCP, siempre en modo mejor esfuerzo (ver
// `sincronizarTareaSilencioso`): un problema con GitHub no puede tirar el guardado
// de la tarjeta.

type TareaSync = {
  id: string
  numero: number
  titulo: string
  descripcion: string | null
  contexto: string | null
  resultado: string | null
  recursos: string | null
  plan: string | null
  estado: string
  prioridad: string
  codigo_proyecto: string | null
  moscow: string | null
  epica: string | null
  etiquetas: string[]
  fecha_limite: string | null
  deleted_at: string | null
  github_repo: string | null
  github_issue_number: number | null
  metadata: Record<string, unknown> | null
  proyectos: { github_repo: string | null } | null
}

const SELECT_SYNC =
  "id, numero, titulo, descripcion, contexto, resultado, recursos, plan, estado, prioridad, codigo_proyecto, moscow, epica, etiquetas, fecha_limite, deleted_at, github_repo, github_issue_number, metadata, proyectos(github_repo)"

function resolverRepo(t: TareaSync): string | null {
  return (
    t.github_repo ??
    t.proyectos?.github_repo ??
    process.env.GITHUB_DEFAULT_REPO ??
    null
  )
}

function labelsDeTarea(t: TareaSync): string[] {
  const labels = [`prioridad:${t.prioridad}`, ...t.etiquetas]
  if (t.moscow) labels.push(`moscow:${t.moscow}`)
  if (t.epica) labels.push(t.epica)
  if (t.codigo_proyecto) labels.push(t.codigo_proyecto)
  if (t.deleted_at) labels.push("borrada")
  return labels
}

function seccion(titulo: string, cuerpo: string | null): string {
  return cuerpo ? `## ${titulo}\n\n${cuerpo}\n\n` : ""
}

function cuerpoDeTarea(t: TareaSync): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? ""
  return (
    (t.descripcion ? `${t.descripcion}\n\n` : "") +
    seccion("Contexto", t.contexto) +
    seccion("Resultado esperado", t.resultado) +
    seccion("Recursos", t.recursos) +
    seccion("Plan", t.plan) +
    (t.fecha_limite ? `**Fecha límite:** ${t.fecha_limite}\n\n` : "") +
    `---\n_Tarjeta ZQ-${t.numero} del backoffice de ZQUARE._` +
    (base ? ` [Ver tablero](${base}/tareas)` : "")
  )
}

function estadoIssue(t: TareaSync): "open" | "closed" {
  return t.deleted_at || t.estado === "hecho" ? "closed" : "open"
}

// Sube los comentarios nuevos de la tarjeta a la issue. Guarda en
// `metadata.github_comentarios` los ids ya subidos para no duplicarlos.
async function espejarComentarios(
  supabase: ReturnType<typeof createAdminClient>,
  t: TareaSync,
  repo: string,
  numeroIssue: number
): Promise<void> {
  const { data: comentarios } = await supabase
    .from("tareas_comentarios")
    .select("id, cuerpo, autor")
    .eq("tarea_id", t.id)
    .is("deleted_at", null)
    .order("created_at")
  if (!comentarios || comentarios.length === 0) return

  const yaSubidos = new Set(
    (t.metadata?.github_comentarios as string[] | undefined) ?? []
  )
  const nuevos = comentarios.filter((c) => !yaSubidos.has(c.id))
  if (nuevos.length === 0) return

  for (const c of nuevos) {
    await comentarIssue(repo, numeroIssue, `**${c.autor}**\n\n${c.cuerpo}`)
    yaSubidos.add(c.id)
  }
  await supabase
    .from("tareas")
    .update({
      metadata: { ...(t.metadata ?? {}), github_comentarios: [...yaSubidos] },
    })
    .eq("id", t.id)
}

export async function sincronizarTarea(tareaId: string): Promise<void> {
  if (!githubConfigurado()) return

  const supabase = createAdminClient()
  const { data } = await supabase
    .from("tareas")
    .select(SELECT_SYNC)
    .eq("id", tareaId)
    .maybeSingle()
  const t = data as TareaSync | null
  if (!t) return

  // Tarjeta ya borrada y nunca espejada: no tiene sentido crear una issue para
  // cerrarla al toque.
  if (t.deleted_at && !t.github_issue_number) return

  const repo = resolverRepo(t)
  if (!repo) return

  const labels = labelsDeTarea(t)
  await asegurarLabels(repo, labels)

  if (!t.github_issue_number) {
    const issue = await crearIssue(repo, {
      title: `ZQ-${t.numero} · ${t.titulo}`,
      body: cuerpoDeTarea(t),
      labels,
    })
    await supabase
      .from("tareas")
      .update({
        github_repo: repo,
        github_issue_number: issue.number,
        github_synced_at: new Date().toISOString(),
      })
      .eq("id", t.id)
    await espejarComentarios(supabase, t, repo, issue.number)
    return
  }

  await actualizarIssue(repo, t.github_issue_number, {
    title: `ZQ-${t.numero} · ${t.titulo}`,
    body: cuerpoDeTarea(t),
    labels,
    state: estadoIssue(t),
  })
  await supabase
    .from("tareas")
    .update({ github_repo: repo, github_synced_at: new Date().toISOString() })
    .eq("id", t.id)
  await espejarComentarios(supabase, t, repo, t.github_issue_number)
}

// Mejor esfuerzo: nunca lanza. La usan las escrituras de la UI y del MCP para
// que un fallo de GitHub no rompa el guardado de la tarjeta.
export async function sincronizarTareaSilencioso(tareaId: string): Promise<void> {
  try {
    await sincronizarTarea(tareaId)
  } catch (e) {
    console.error(`No se pudo espejar la tarea ${tareaId} en GitHub:`, e)
  }
}

// Reenvía las tarjetas que quedaron sin espejar (nunca sincronizadas, o
// cambiadas después del último push). La usa el cron y el backfill. Procesa de
// a lotes para no pasarse del límite de tiempo ni del rate limit de GitHub.
export async function reconciliarTareas(limite = 30): Promise<{
  procesadas: number
  errores: string[]
}> {
  if (!githubConfigurado()) return { procesadas: 0, errores: [] }

  const supabase = createAdminClient()
  // Pendientes: sin issue todavía, o con cambios posteriores al último push.
  const { data } = await supabase.rpc("tareas_pendientes_github", { limite })

  const errores: string[] = []
  let procesadas = 0
  for (const t of (data ?? []) as {
    id: string
    github_issue_number: number | null
    deleted_at: string | null
  }[]) {
    // Nada que crear para una tarjeta ya borrada sin espejo.
    if (t.deleted_at && !t.github_issue_number) continue
    try {
      await sincronizarTarea(t.id)
      procesadas++
    } catch (e) {
      errores.push(`${t.id}: ${e instanceof Error ? e.message : e}`)
    }
  }
  return { procesadas, errores }
}

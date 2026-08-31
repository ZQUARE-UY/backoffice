# Plan: mirror `tareas` to GitHub issues (one-way)

## Goal

Push the backoffice board (`tareas`) to GitHub issues so an agent that reads
GitHub can see every project's tasks. One direction only: backoffice → GitHub.
Nobody edits the issues by hand, so there is no webhook and no two-way sync.

Supabase stays the source of truth. GitHub is a read mirror for the agent.

## Decisions (locked)

- Direction: one-way, backoffice → GitHub. No webhook, no loop handling.
- Target: per-project repo. Each `proyecto` maps to one repo. Tasks with no
  project use a default repo.
- Freshness: push inline at write time (awaited, best effort). A daily cron
  reconciles anything that was missed. Reason: Vercel Hobby cron runs once a day,
  too slow to be the main path.
- Scope: create, edit, move (open/close), delete, and comments. All one-way.
- GitHub Projects v2 board: optional, last phase. The agent can already list
  issues by repo and label without it.

## What exists today (facts)

- Table `public.tareas`. Short code `ZQ-<numero>`. Columns: `titulo`,
  `descripcion`, brief (`contexto`, `resultado`, `recursos`, `plan`), `estado`
  (`backlog`/`por_hacer`/`en_curso`/`en_revision`/`hecho`), `prioridad`,
  `codigo_proyecto`, `estimacion`, `moscow`, `epica`, `etiquetas`, `cliente_id`,
  `proyecto_id`, `sprint_id`, `metadata` jsonb, soft delete `deleted_at`.
- Tables `public.tareas_comentarios` and `public.tareas_versiones`.
- Two write paths, both must trigger the push:
  1. UI server actions: `src/app/(protegido)/tareas/actions.ts`
     (`crearTarea`, `actualizarTarea`, `moverTarea`, `pasarAlTablero`,
     `eliminarTarea`, `comentarTarea`).
  2. MCP tools: `src/app/api/mcp/[transport]/route.ts`
     (`crear_tarea`, `actualizar_tarea`, `mover_tarea`, `comentar_tarea`).
- No GitHub code exists. Greenfield.
- External services follow one pattern: a `src/lib/<service>.ts` module, secrets
  from `process.env`, a `xxxConfigurado()` gate (see `src/lib/google.ts`,
  `src/lib/drive.ts`). External calls use raw `fetch`.
- Cron route exists: `src/app/api/cron/reindexar/route.ts`, gated by
  `CRON_SECRET`, scheduled in `vercel.json`.
- No test harness in this repo. Verification is `tsc --noEmit`, `eslint`, and
  manual checks.

## Core design

### Inline push, cron as safety net

Each task write calls one helper, `sincronizarTarea(tareaId)`, at the end, inside
its own try/catch. The push is best effort: if GitHub fails, the task write still
succeeds and the error is logged. This keeps the mirror fresh without waiting for
the daily cron.

The helper is idempotent: if the task has no `github_issue_number`, it creates
the issue and stores the number; otherwise it updates the existing issue. Moving
to `hecho` or soft-deleting closes the issue.

A daily cron (`reconciliar-github`) finds tasks that are out of sync (no issue
number, or `updated_at` newer than `github_synced_at`) and pushes them. This
catches writes that happened while GitHub was down.

No outbox table is needed. The two-way loop problem does not exist here, since
nothing flows back from GitHub.

### Project to repo resolution

Order: `tarea.github_repo` (frozen once the issue is created) →
`proyecto.github_repo` → `GITHUB_DEFAULT_REPO`.

## Data model changes

New migration `supabase/migrations/2026xxxx_github_sync.sql`:

- `alter table public.proyectos add column github_repo text` — `owner/repo`.
  Optional check `~ '^[^/]+/[^/]+$'`.
- `alter table public.tareas`
  - `add column github_repo text` — resolved repo.
  - `add column github_issue_number bigint`.
  - `add column github_synced_at timestamptz` — last successful push.
- Update the `Tarea` and `Proyecto` types in `src/lib/dominio.ts`.

(No outbox table. No `github_node_id`/`github_project_item_id` unless the
optional Projects v2 phase is built; add them in that migration if so.)

## Environment variables

Add to `.env.example` and README:

- `GITHUB_TOKEN` — fine-grained PAT with issues read/write on the target repos.
- `GITHUB_OWNER` — org or user that owns the repos.
- `GITHUB_DEFAULT_REPO` — `owner/repo` for tasks with no project.

`githubConfigurado()` is true only when all three are set. When false, all sync
is skipped, so the app runs unchanged without GitHub configured.

## New files

- `src/lib/github.ts` — raw GitHub REST client (`fetch`, no new dependency):
  - `githubConfigurado(): boolean`
  - `crearIssue(repo, { title, body, labels })` → `{ number }`
  - `actualizarIssue(repo, number, { title, body, labels, state })`
  - `comentarIssue(repo, number, body)`
  - `asegurarLabels(repo, labels)` — best effort, create missing labels.
- `src/lib/tareas-github.ts` — mapping and orchestration:
  - `resolverRepo(tarea): Promise<string>`
  - `issueDesdeTarea(tarea)` → `{ title, body, labels }`. Title `ZQ-<n> ·
    <titulo>`. Body from `descripcion` + brief sections + a footer with the
    `ZQ-N` code and a link to `/tareas`. Labels from `prioridad`, `moscow`,
    `epica`, `codigo_proyecto`, and `etiquetas`.
  - `sincronizarTarea(tareaId)` — read the task, create or update the issue,
    close on `hecho`/deleted, mirror new comments, write `github_repo`,
    `github_issue_number`, `github_synced_at`. Never throws.
  - `reconciliarTareas(limite)` — push tasks that are missing or stale.
- `src/app/api/cron/reconciliar-github/route.ts` — daily cron, gated by
  `CRON_SECRET`, calls `reconciliarTareas`.

## Modified files

- `src/app/(protegido)/tareas/actions.ts` — call `sincronizarTarea` best effort
  at the end of `crearTarea`, `actualizarTarea`, `pasarAlTablero`, `moverTarea`,
  `comentarTarea`, `eliminarTarea`.
- `src/app/api/mcp/[transport]/route.ts` — same calls in `crear_tarea`,
  `actualizar_tarea`, `mover_tarea`, `comentar_tarea`. Add `github_repo` to
  `actualizar_proyecto` so an agent can map a project to a repo. Optional MCP
  tool `sincronizar_tareas_github` to trigger a backfill on demand.
- `src/app/(protegido)/proyectos/...` — add a `github_repo` field to the project
  edit form and its server action.
- `src/app/(protegido)/tareas/detalle-tarea.tsx` — show the issue link when the
  task has one (read-only, nice to have).
- `vercel.json` — add the daily cron for `/api/cron/reconciliar-github`.
- `README.md` and `.env.example` — document the env vars and setup.

## Comments

Task comments (`tareas_comentarios`) push to issue comments one-way, so the agent
sees the discussion. To avoid duplicating a comment on every sync, store the
mirrored comment ids in the task `metadata` (for example
`metadata.github_comentarios: [ids]`) and post only the new ones.

## Phases

Each phase ships on its own. Stop after any phase and the app still works.

### Phase 0 — Config and client
- Add env vars and `.env.example`.
- Write `src/lib/github.ts` (`githubConfigurado`, `crearIssue`,
  `actualizarIssue`, `comentarIssue`, `asegurarLabels`).
- Accept: a manual call creates and updates an issue in a test repo.

### Phase 1 — Schema
- Write the migration (task columns, `proyecto.github_repo`).
- Update `Tarea` and `Proyecto` types.
- Accept: migration applies; `tsc` clean.

### Phase 2 — Inline push
- Write `tareas-github.ts` (`resolverRepo`, `issueDesdeTarea`,
  `sincronizarTarea`).
- Wire the best-effort call into both write paths.
- Accept: creating a task in the UI or via MCP produces an issue at once;
  editing updates it; moving to `hecho` closes it; deleting closes it.

### Phase 3 — Backfill and cron safety net
- Write `reconciliarTareas` and the daily cron route; add the `vercel.json`
  schedule.
- Add the manual trigger (MCP tool or `CRON_SECRET` route) so the first backfill
  runs now, not tomorrow.
- Accept: all existing tasks get issues; re-running is idempotent.

### Phase 4 — GitHub Projects v2 board (optional)
- Add `github_node_id` and `github_project_item_id` columns.
- Add GraphQL calls to `github.ts` to add each issue to the board and set its
  status field from `estado`.
- Accept: issues appear on the board in the right column.
- Note: needs org Projects scope on the token. Skip if the token cannot get it;
  the repo + label mirror already lets the agent see everything.

## Mapping

### estado to issue state

| estado                      | issue state |
|-----------------------------|-------------|
| backlog / por_hacer / en_curso / en_revision | open |
| hecho                       | closed      |
| deleted_at set              | closed (label `borrada`) |

### labels
- `prioridad:<baja|media|alta|urgente>`
- `moscow:<must|should|could|wont>` when set
- `epica:<EP-n>` when set
- `codigo:<US-…>` when set
- each entry of `etiquetas`

## Limits (by design)

- One-way only. If the agent closes or edits an issue on GitHub, the backoffice
  does not change. If that becomes useful later, add a webhook phase.
- Inline push adds one GitHub REST call to each task write (~300 to 800 ms). It
  is awaited but best effort, so a GitHub outage slows the write slightly and
  logs an error; it never fails the write.

## Recommendation

Build Phases 0 to 3. That gives a fresh one-way mirror plus backfill, which is
exactly what the agent needs to see every task. Add Phase 4 only if you want the
board view and the token can get Projects scope. Ship each phase on its own
branch with `tsc` and `eslint` clean and a short manual check.

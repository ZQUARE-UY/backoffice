-- Tablero v3: brief de desarrollo de las tarjetas. Una tarjeta se crea con lo
-- mínimo (título) y se "desarrolla" —normalmente iterando con Claude vía el
-- prompt MCP `desarrollar_tarea`— hasta un brief que cualquier persona o
-- agente pueda agarrar y resolver sin más contexto:
--   contexto   por qué existe: qué problema o pedido la origina
--   resultado  qué tiene que ser verdad al terminar (criterios verificables)
--   recursos   links, documentos, repos, accesos, personas
--   plan       pasos sugeridos en orden
-- Campos text comparables entre tarjetas, mismo patrón que el one-pager de
-- ideas (ver 20260729000001_ideas.sql).

alter table public.tareas
  add column contexto text,
  add column resultado text,
  add column recursos text,
  add column plan text;

-- ── Versiones ─────────────────────────────────────────────────────────────
-- Snapshot del contenido tras cada creación/edición (no tras movimientos de
-- columna u orden: eso es posición, no contenido). Snapshot explícito escrito
-- por quien edita, no trigger: quien escribe (server action o MCP) sabe quién
-- es el autor; un trigger con service role no. `autor_socio_id` null +
-- `autor` texto libre permite atribuir ediciones de un agente ("Nombre (Claude)").

create table public.tareas_versiones (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.tareas (id) on delete cascade,
  snapshot jsonb not null,
  autor text not null,
  autor_socio_id uuid references public.socios (id),
  created_at timestamptz not null default now()
);

create index tareas_versiones_tarea_idx
  on public.tareas_versiones (tarea_id, created_at);

alter table public.tareas_versiones enable row level security;

create policy "socios operan versiones de tareas"
  on public.tareas_versiones for all
  to authenticated
  using (public.es_socio())
  with check (public.es_socio());

-- Grant explícito para el endpoint MCP (service role key, sin RLS): las
-- imágenes nuevas de Postgres de Supabase ya no dan DML a service_role por
-- default privileges sobre tablas creadas por `postgres`.
grant select, insert, update, delete on public.tareas_versiones to service_role;

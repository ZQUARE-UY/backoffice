-- Inicializador de proyectos: estandarizar cómo arranca un proyecto nuevo.
--
-- Hasta ahora `proyectos` tenía solo los datos comerciales (montos, fechas,
-- horas). Todo lo que hace falta para *empezar a trabajar* —qué se acordó, qué
-- queda afuera, quién decide del lado del cliente, dónde vive el código, qué
-- accesos hacen falta— vivía en la cabeza de quien vendió el proyecto o
-- disperso en documentos de Drive. Esta migración le da lugar en la base.
--
-- Decisiones de diseño (mismas que el one-pager de ideas y el brief de
-- tareas, ver 20260729000001_ideas.sql y 20260729000002_brief_tareas.sql):
-- - Campos `text` fijos, no jsonb: son comparables entre proyectos y se
--   pueden pedir por nombre desde el MCP.
-- - Historial explícito en `proyectos_versiones` (snapshot por edición), no
--   trigger: quien escribe sabe quién es el autor; un trigger con service
--   role no.
-- - `kickoff_completado_at` es el hecho, no un estado más: un proyecto puede
--   estar `en_curso` con el brief a medio hacer, y esa es justamente la
--   situación que queremos ver en el listado.

-- ── Dueño y tipo ──────────────────────────────────────────────────────────

alter table public.proyectos
  -- El socio a cargo. Con cuatro socios, "mis proyectos" es el filtro que más
  -- se usa, y es quien recibe el kickoff.
  add column responsable_id uuid references public.socios (id),
  -- Clase de trabajo. Decide qué tareas de setup y qué preguntas usa el
  -- inicializador (ver PLANTILLAS_SETUP en src/lib/dominio.ts). Nullable:
  -- los proyectos que ya existen no tienen por qué clasificarse a la fuerza.
  add column tipo text
    check (tipo in ('desarrollo', 'integracion', 'mantenimiento', 'interno'));

create index proyectos_responsable_idx
  on public.proyectos (responsable_id) where deleted_at is null;

-- ── Brief de arranque ─────────────────────────────────────────────────────
-- Las nueve preguntas que hay que tener contestadas antes de escribir la
-- primera línea de código. Son las que hace el prompt MCP `comenzar_proyecto`.

alter table public.proyectos
  add column objetivo text,
  add column alcance text,
  add column fuera_de_alcance text,
  add column stakeholders text,
  add column stack_y_repos text,
  add column entornos_y_accesos text,
  add column riesgos text,
  add column definicion_de_hecho text,
  add column hitos text;

comment on column public.proyectos.objetivo is
  'Qué problema del cliente resuelve el proyecto y cómo se sabrá que valió la pena.';
comment on column public.proyectos.alcance is
  'Qué entra: funcionalidades, entregables, integraciones acordadas.';
comment on column public.proyectos.fuera_de_alcance is
  'Qué NO entra. Es el campo que evita las discusiones del mes tres.';
comment on column public.proyectos.stakeholders is
  'Quién decide del lado del cliente, quién valida, quién da accesos, por qué canal.';
comment on column public.proyectos.stack_y_repos is
  'Tecnologías acordadas, repos, convenciones que aplican (ver estándares de ZQUARE).';
comment on column public.proyectos.entornos_y_accesos is
  'Entornos (local/staging/prod), credenciales y accesos que hay que pedir, y a quién.';
comment on column public.proyectos.riesgos is
  'Qué puede salir mal y qué haríamos: dependencias del cliente, incógnitas técnicas, plazos.';
comment on column public.proyectos.definicion_de_hecho is
  'Qué tiene que cumplir una tarjeta para estar hecha en ESTE proyecto (tests, review, deploy, aceptación).';
comment on column public.proyectos.hitos is
  'Entregas intermedias con fecha: contra qué se mide el avance y, si aplica, qué se factura.';

-- ── Kickoff ───────────────────────────────────────────────────────────────
-- El arranque es un hecho puntual con autor: lo marca `comenzar_proyecto`
-- (MCP) o el botón de la ficha. Antes de eso el proyecto aparece como "sin
-- comenzar" en el listado, sin importar su estado comercial.

alter table public.proyectos
  add column kickoff_completado_at timestamptz,
  add column kickoff_por text;

comment on column public.proyectos.kickoff_completado_at is
  'Cuándo se completó el arranque estandarizado. Null = todavía no comenzó.';
comment on column public.proyectos.kickoff_por is
  'Quién lo completó, en texto libre para poder atribuir a un agente ("Nombre (Claude)").';

-- Índice del listado: la pestaña Proyectos agrupa por estado y ordena por
-- fecha de fin estimada (los que vencen primero, arriba).
create index proyectos_listado_idx
  on public.proyectos (estado, fecha_fin_estimada)
  where deleted_at is null;

-- ── Versiones ─────────────────────────────────────────────────────────────
-- Mismo patrón que ideas_versiones y tareas_versiones.

create table public.proyectos_versiones (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  snapshot jsonb not null,
  autor text not null,
  autor_socio_id uuid references public.socios (id),
  created_at timestamptz not null default now()
);

create index proyectos_versiones_proyecto_idx
  on public.proyectos_versiones (proyecto_id, created_at);

alter table public.proyectos_versiones enable row level security;

create policy "socios operan versiones de proyectos"
  on public.proyectos_versiones for all
  to authenticated
  using (public.es_socio())
  with check (public.es_socio());

-- Grant explícito para el endpoint MCP (service role key, sin RLS): las
-- imágenes nuevas de Postgres de Supabase ya no dan DML a service_role por
-- default privileges sobre tablas creadas por `postgres`.
grant select, insert, update, delete
  on public.proyectos_versiones to service_role;

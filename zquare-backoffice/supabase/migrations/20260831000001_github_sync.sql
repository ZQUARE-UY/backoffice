-- Espejo del tablero en GitHub (una sola dirección: backoffice → GitHub).
-- Cada proyecto apunta a su repo; las tareas sin proyecto van al repo por
-- defecto (env GITHUB_DEFAULT_REPO). El espejo lo hace la app, no la base:
-- acá solo viven el destino y el estado del último push.

alter table public.proyectos
  add column github_repo text
    -- "owner/repo". El check evita guardar una URL entera o un nombre suelto.
    check (github_repo is null or github_repo ~ '^[^/]+/[^/]+$');

alter table public.tareas
  -- Repo resuelto al crear la issue: se congela para que remapear el proyecto
  -- después no mueva una issue que ya existe.
  add column github_repo text,
  add column github_issue_number bigint,
  -- Último push exitoso: el cron de reconciliación reenvía las tareas cuyo
  -- updated_at es más nuevo que esto (o que nunca se sincronizaron).
  add column github_synced_at timestamptz;

-- Búsqueda inversa issue → tarea, y guard de unicidad del espejo.
create unique index tareas_github_issue_idx
  on public.tareas (github_repo, github_issue_number)
  where github_issue_number is not null;

-- Tarjetas pendientes de espejar: nunca sincronizadas, o cambiadas después del
-- último push. Es una función porque PostgREST no compara dos columnas entre sí
-- en un filtro (updated_at > github_synced_at). La usa el cron de reconciliación.
create or replace function public.tareas_pendientes_github(limite int default 30)
returns setof public.tareas
language sql
stable
as $$
  select *
  from public.tareas
  where github_synced_at is null
     or updated_at > github_synced_at
  order by updated_at
  limit limite;
$$;

grant execute on function public.tareas_pendientes_github(int) to service_role;

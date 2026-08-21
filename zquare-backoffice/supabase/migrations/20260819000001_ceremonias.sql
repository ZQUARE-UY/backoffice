-- Tablero v6: ceremonias de sprint + vista Calendario.
--
-- Un sprint tiene fechas, pero hasta ahora nada decía *cuándo* se hace la
-- planning, la daily, la review o la retro: eso vivía en la cabeza de cada
-- socio o en el calendario personal de alguno. Esta tabla las vuelve datos del
-- sprint, para verlas en el calendario del backoffice (sprints + ceremonias,
-- filtrables por proyecto) y para que Claude pueda leerlas y proponerlas.
--
-- Decisiones:
-- - Una fila por ocurrencia (la daily genera una por día hábil del sprint),
--   no reglas de recurrencia: es lo que se ve en un calendario, se puede
--   mover/borrar una sola y cada fila puede tener su evento de Google 1:1.
-- - `inicio` es timestamptz (un instante): la UI lo ingresa como fecha + hora
--   de pared en America/Montevideo y lo convierte, igual que las reuniones.
-- - Definirlas es reemplazar el juego completo del sprint (soft delete de las
--   anteriores + insert): lo que se ve en pantalla es lo último que se guardó.
-- - `google_event_id` / `google_calendar_id` / `meet_url` quedan previstos
--   para crear el evento en Google Calendar como con las reuniones; esta
--   versión todavía no los completa.

create table public.ceremonias (
  id uuid primary key default gen_random_uuid(),
  sprint_id uuid not null references public.sprints (id),
  tipo text not null
    check (tipo in ('planning', 'daily', 'review', 'retro')),
  inicio timestamptz not null,
  duracion_min integer not null default 30
    check (duracion_min between 5 and 480),
  notas text,
  google_event_id text,
  google_calendar_id text,
  meet_url text,
  metadata jsonb not null default '{}',
  created_by uuid references public.socios (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Calendario: ceremonias de un rango de fechas (cruzado con sprints).
create index ceremonias_inicio_idx
  on public.ceremonias (inicio) where deleted_at is null;

-- Las de un sprint, para reemplazarlas y para la ficha del sprint.
create index ceremonias_sprint_idx
  on public.ceremonias (sprint_id, inicio) where deleted_at is null;

create trigger ceremonias_updated_at
  before update on public.ceremonias
  for each row execute function public.set_updated_at();

alter table public.ceremonias enable row level security;

create policy "socios operan ceremonias"
  on public.ceremonias for all
  to authenticated
  using (public.es_socio())
  with check (public.es_socio());

grant select, insert, update, delete on public.ceremonias to service_role;

comment on table public.ceremonias is
  'Ceremonias de un sprint (planning, daily, review, retro), una fila por ocurrencia. Se ven en el calendario de /tareas.';

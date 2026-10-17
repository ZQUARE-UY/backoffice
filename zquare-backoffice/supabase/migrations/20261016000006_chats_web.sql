-- Chat con IA de la web (zquare.uy). Cada conversación es una fila: la ruta
-- pública /api/publico/chat guarda acá, con la service role, los mensajes en
-- el formato de la API de Claude (así se reenvían tal cual en el turno
-- siguiente) y la web solo conoce el id. Sin IP ni cookies. Si en la charla
-- la persona deja sus datos, el bot crea una consulta en la bandeja de Web
-- (consultas_web, origen 'chat') y queda vinculada en consulta_id.
-- Los socios las leen en Web → Chats.

create table public.chats_web (
  id uuid primary key default gen_random_uuid(),
  mensajes jsonb not null default '[]',
  -- Mensajes de la persona (para el tope por conversación sin contar el JSON).
  turnos int not null default 0,
  idioma text check (idioma in ('es', 'en')),
  ruta text,
  dispositivo text check (dispositivo in ('movil', 'tablet', 'escritorio')),
  consulta_id uuid references public.consultas_web (id),
  -- Tokens que gastó la conversación (entrada + salida), para vigilar el costo.
  tokens_entrada int not null default 0,
  tokens_salida int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index chats_web_fecha_idx on public.chats_web (updated_at desc) where deleted_at is null;

create trigger chats_web_updated_at
  before update on public.chats_web
  for each row execute function public.set_updated_at();

alter table public.chats_web enable row level security;

create policy "socios operan chats_web"
  on public.chats_web for all
  to authenticated
  using (public.es_socio())
  with check (public.es_socio());

grant select, insert, update, delete on public.chats_web to service_role;

-- De dónde vino cada consulta: el formulario de contacto o el chat.
alter table public.consultas_web
  add column origen text not null default 'formulario'
  check (origen in ('formulario', 'chat'));

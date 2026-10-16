-- Consultas que llegan por el formulario de contacto de la web (zquare.uy).
-- Viven en la sección Web del backoffice como bandeja propia: entran como
-- "nueva" y un socio las revisa. Desde ahí se promueven al resto del
-- backoffice (crear un cliente potencial o vincular uno existente, que queda
-- en cliente_id), se marcan atendidas o se descartan (spam, no aplica).
-- La inserta la ruta pública /api/publico/contacto con la service role.

create table public.consultas_web (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null,
  empresa text,
  intereses text[] not null default '{}',
  mensaje text not null,
  idioma text check (idioma in ('es', 'en')),
  estado text not null default 'nueva'
    check (estado in ('nueva', 'atendida', 'descartada')),
  cliente_id uuid references public.clientes (id),
  revisada_por uuid references public.socios (id),
  revisada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index consultas_web_estado_idx on public.consultas_web (estado, created_at desc) where deleted_at is null;
create index consultas_web_cliente_idx on public.consultas_web (cliente_id) where deleted_at is null;
-- Para el límite de envíos por email en la ruta pública.
create index consultas_web_email_idx on public.consultas_web (email, created_at desc);

create trigger consultas_web_updated_at
  before update on public.consultas_web
  for each row execute function public.set_updated_at();

alter table public.consultas_web enable row level security;

create policy "socios operan consultas_web"
  on public.consultas_web for all
  to authenticated
  using (public.es_socio())
  with check (public.es_socio());

grant select, insert, update, delete on public.consultas_web to service_role;

-- Fase 1: decisiones (bitácora de la empresa).
-- Una decisión puede ser de empresa (sin cliente ni proyecto) o estar ligada a
-- un cliente/proyecto. Los participantes se guardan como lista de nombres.

create table public.decisiones (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  detalle text,
  fecha date not null default current_date,
  participantes text[] not null default '{}',
  cliente_id uuid references public.clientes (id),
  proyecto_id uuid references public.proyectos (id),
  created_by uuid references public.socios (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index decisiones_fecha_idx on public.decisiones (fecha desc) where deleted_at is null;
create index decisiones_cliente_idx on public.decisiones (cliente_id) where deleted_at is null;

create trigger decisiones_updated_at
  before update on public.decisiones
  for each row execute function public.set_updated_at();

alter table public.decisiones enable row level security;

create policy "socios operan decisiones"
  on public.decisiones for all
  to authenticated
  using (public.es_socio())
  with check (public.es_socio());

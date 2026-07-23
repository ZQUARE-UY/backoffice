-- Fase 1: clientes y proyectos.
-- Sigue los principios del esquema inicial: id uuid, created_at, updated_at,
-- created_by, soft delete via deleted_at, estados como catálogo (check
-- constraint, fácil de ampliar), RLS restringido a socios.

-- ── Clientes ──────────────────────────────────────────────────────────────

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  empresa text,
  email text,
  telefono text,
  estado text not null default 'potencial'
    check (estado in ('potencial', 'activo', 'inactivo')),
  origen text,
  notas text,
  metadata jsonb not null default '{}',
  created_by uuid references public.socios (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index clientes_estado_idx on public.clientes (estado) where deleted_at is null;
create index clientes_nombre_idx on public.clientes (nombre) where deleted_at is null;

create trigger clientes_updated_at
  before update on public.clientes
  for each row execute function public.set_updated_at();

alter table public.clientes enable row level security;

create policy "socios operan clientes"
  on public.clientes for all
  to authenticated
  using (public.es_socio())
  with check (public.es_socio());

-- ── Proyectos ─────────────────────────────────────────────────────────────

create table public.proyectos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  nombre text not null,
  descripcion text,
  estado text not null default 'propuesta'
    check (estado in ('propuesta', 'en_curso', 'entregado', 'mantenimiento', 'cancelado')),
  fecha_inicio date,
  fecha_fin_estimada date,
  fecha_fin_real date,
  horas_estimadas numeric(10, 2),
  horas_reales numeric(10, 2),
  monto_acordado numeric(14, 2),
  moneda text check (moneda in ('USD', 'UYU')),
  metadata jsonb not null default '{}',
  created_by uuid references public.socios (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index proyectos_cliente_idx on public.proyectos (cliente_id) where deleted_at is null;
create index proyectos_estado_idx on public.proyectos (estado) where deleted_at is null;

create trigger proyectos_updated_at
  before update on public.proyectos
  for each row execute function public.set_updated_at();

alter table public.proyectos enable row level security;

create policy "socios operan proyectos"
  on public.proyectos for all
  to authenticated
  using (public.es_socio())
  with check (public.es_socio());

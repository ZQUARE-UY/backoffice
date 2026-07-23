-- Fase 1: presupuestos y sus ítems.
-- El presupuesto pertenece al cliente (un cliente puede tener varios) y
-- opcionalmente se vincula a un proyecto. Ítems por horas (horas × tarifa).
-- El detalle por ítem es la materia prima del generador de presupuestos con IA.

-- ── Presupuestos ──────────────────────────────────────────────────────────

create table public.presupuestos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  proyecto_id uuid references public.proyectos (id),
  version integer not null default 1,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'enviado', 'aprobado', 'rechazado')),
  moneda text not null default 'USD' check (moneda in ('USD', 'UYU')),
  fecha_envio date,
  total numeric(14, 2) not null default 0,
  notas text,
  drive_url text,
  metadata jsonb not null default '{}',
  created_by uuid references public.socios (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index presupuestos_cliente_idx on public.presupuestos (cliente_id) where deleted_at is null;
create index presupuestos_proyecto_idx on public.presupuestos (proyecto_id) where deleted_at is null;
create index presupuestos_estado_idx on public.presupuestos (estado) where deleted_at is null;

create trigger presupuestos_updated_at
  before update on public.presupuestos
  for each row execute function public.set_updated_at();

alter table public.presupuestos enable row level security;

create policy "socios operan presupuestos"
  on public.presupuestos for all
  to authenticated
  using (public.es_socio())
  with check (public.es_socio());

-- ── Ítems del presupuesto ─────────────────────────────────────────────────
-- Se borran en cascada con el presupuesto. Al editar se reemplaza el set
-- completo, por eso no llevan soft delete propio.

create table public.presupuesto_items (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos (id) on delete cascade,
  descripcion text not null,
  horas numeric(10, 2),
  tarifa numeric(14, 2) not null default 0,
  subtotal numeric(14, 2) not null default 0,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

create index presupuesto_items_presupuesto_idx on public.presupuesto_items (presupuesto_id);

alter table public.presupuesto_items enable row level security;

create policy "socios operan items"
  on public.presupuesto_items for all
  to authenticated
  using (public.es_socio())
  with check (public.es_socio());

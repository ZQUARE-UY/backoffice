-- Fase 2: finanzas (movimientos y balance entre socios).
-- Cada movimiento se registra en su moneda original con el tipo de cambio del
-- día; monto_usd es una columna generada para consolidar reportes en USD.
-- Sigue los principios del esquema (id uuid, timestamps, created_by, soft
-- delete, estados como catálogo con check, RLS restringido a socios).

-- ── Movimientos ───────────────────────────────────────────────────────────
-- tc_a_usd: unidades de la moneda original que equivalen a 1 USD (para USD es
-- 1; para UYU, ej. 40). monto_usd = monto / tc_a_usd.

create table public.movimientos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null
    check (tipo in ('ingreso', 'gasto', 'aporte_socio', 'retiro_socio')),
  fecha date not null default current_date,
  moneda text not null default 'USD' check (moneda in ('USD', 'UYU')),
  monto numeric(14, 2) not null check (monto >= 0),
  tc_a_usd numeric(14, 4) not null default 1 check (tc_a_usd > 0),
  monto_usd numeric(14, 2) generated always as (round(monto / tc_a_usd, 2)) stored,
  categoria text,
  descripcion text,
  socio_id uuid references public.socios (id),
  cliente_id uuid references public.clientes (id),
  proyecto_id uuid references public.proyectos (id),
  comprobante_url text,
  metadata jsonb not null default '{}',
  created_by uuid references public.socios (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index movimientos_fecha_idx on public.movimientos (fecha desc) where deleted_at is null;
create index movimientos_tipo_idx on public.movimientos (tipo) where deleted_at is null;
create index movimientos_socio_idx on public.movimientos (socio_id) where deleted_at is null;
create index movimientos_cliente_idx on public.movimientos (cliente_id) where deleted_at is null;

create trigger movimientos_updated_at
  before update on public.movimientos
  for each row execute function public.set_updated_at();

alter table public.movimientos enable row level security;

create policy "socios operan movimientos"
  on public.movimientos for all
  to authenticated
  using (public.es_socio())
  with check (public.es_socio());

-- ── Balance de socios ─────────────────────────────────────────────────────
-- Vista derivada: cuánto puso neto cada socio (aportes menos retiros) en USD.
-- La comparación contra el promedio (quién está "abajo") se calcula en la app.
-- security_invoker: la vista respeta el RLS de las tablas subyacentes.

create view public.balance_socios
  with (security_invoker = on)
  as
  select
    s.id as socio_id,
    s.nombre,
    coalesce(sum(
      case m.tipo
        when 'aporte_socio' then m.monto_usd
        when 'retiro_socio' then -m.monto_usd
        else 0
      end
    ), 0) as aporte_neto_usd
  from public.socios s
  left join public.movimientos m
    on m.socio_id = s.id and m.deleted_at is null
  where s.deleted_at is null
  group by s.id, s.nombre;

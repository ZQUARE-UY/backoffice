-- Finanzas v3: liquidaciones entre socios y movimientos recurrentes.
--
-- Liquidaciones. Cuando un socio le transfiere a otro para saldar el balance,
-- eso no es un ingreso ni un gasto de la empresa: no cambia el resultado ni la
-- caja, solo mueve el saldo entre los dos. Por eso vive en su propia tabla y
-- no en `movimientos` (que queda para hechos económicos: lo que la empresa
-- ganó o gastó). Cargarla como gasto "pagado por uno, repartido al otro"
-- cuadraría el saldo, pero inflaría los gastos con algo que no existió.
--
-- Recurrentes. Una plantilla (ej. Google Workspace, USD 7 por mes) que el cron
-- diario convierte en movimientos reales: la próxima ocurrencia existe como
-- `previsto` (se ve en comprometido) y el día que vence pasa a `confirmado`.
-- Cada movimiento generado apunta a su plantilla con `recurrente_id`.

-- ── Liquidaciones ─────────────────────────────────────────────────────────

create table public.liquidaciones (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  de_socio_id uuid not null references public.socios (id),
  para_socio_id uuid not null references public.socios (id),
  moneda text not null default 'USD' check (moneda in ('USD', 'UYU')),
  monto numeric(14, 2) not null check (monto > 0),
  tc_a_usd numeric(14, 4) not null default 1 check (tc_a_usd > 0),
  monto_usd numeric(14, 2) generated always as (round(monto / tc_a_usd, 2)) stored,
  nota text,
  comprobante_url text,
  created_by uuid references public.socios (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (de_socio_id <> para_socio_id)
);

create index liquidaciones_fecha_idx
  on public.liquidaciones (fecha desc) where deleted_at is null;

create trigger liquidaciones_updated_at
  before update on public.liquidaciones
  for each row execute function public.set_updated_at();

alter table public.liquidaciones enable row level security;

create policy "socios operan liquidaciones"
  on public.liquidaciones for all
  to authenticated
  using (public.es_socio())
  with check (public.es_socio());

grant select, insert, update, delete on public.liquidaciones to service_role;

-- ── Movimientos recurrentes ───────────────────────────────────────────────
-- La fecha del primer cobro define el patrón: mensual = ese día de cada mes
-- (el 31 cae en el último día de los meses cortos); anual = ese día y mes de
-- cada año. `reparto` es la misma lista que movimiento_participaciones
-- ([{socio_id, partes}]), guardada en la plantilla para copiarla a cada
-- movimiento generado; vacía = partes iguales entre los socios activos.

create table public.movimientos_recurrentes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'gasto' check (tipo in ('ingreso', 'gasto')),
  descripcion text not null,
  categoria text,
  moneda text not null default 'USD' check (moneda in ('USD', 'UYU')),
  monto numeric(14, 2) not null check (monto > 0),
  tc_a_usd numeric(14, 4) not null default 1 check (tc_a_usd > 0),
  socio_id uuid references public.socios (id),
  cliente_id uuid references public.clientes (id),
  proyecto_id uuid references public.proyectos (id),
  reparto jsonb not null default '[]',
  frecuencia text not null default 'mensual'
    check (frecuencia in ('mensual', 'anual')),
  fecha_inicio date not null,
  fecha_fin date,
  activo boolean not null default true,
  created_by uuid references public.socios (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

create trigger movimientos_recurrentes_updated_at
  before update on public.movimientos_recurrentes
  for each row execute function public.set_updated_at();

alter table public.movimientos_recurrentes enable row level security;

create policy "socios operan recurrentes"
  on public.movimientos_recurrentes for all
  to authenticated
  using (public.es_socio())
  with check (public.es_socio());

grant select, insert, update, delete
  on public.movimientos_recurrentes to service_role;

-- Una sola ocurrencia por plantilla y fecha. Unique SIN filtrar deleted_at a
-- propósito: si alguien borra una ocurrencia generada (ej. ese mes no se
-- cobró), el cron no la vuelve a crear.
alter table public.movimientos
  add column recurrente_id uuid references public.movimientos_recurrentes (id);

alter table public.movimientos
  add constraint movimientos_recurrente_fecha_key unique (recurrente_id, fecha);

-- ── Balance de socios ─────────────────────────────────────────────────────
-- Igual que en 20260908000001, más las liquidaciones: quien transfiere sube su
-- saldo (achica lo que debe) y quien recibe lo baja (achica lo que le deben).

drop view if exists public.balance_socios;

create view public.balance_socios
  with (security_invoker = on)
  as
  with socios_activos as (
    select id, nombre from public.socios where deleted_at is null
  ),
  de_su_bolsillo as (
    select
      socio_id,
      sum(monto_usd) filter (where tipo = 'gasto') as pagado,
      sum(monto_usd) filter (where tipo = 'ingreso') as cobrado
    from public.movimientos
    where deleted_at is null
      and estado = 'confirmado'
      and socio_id is not null
    group by socio_id
  ),
  le_toca as (
    select
      socio_id,
      sum(cuota_usd) filter (where tipo = 'gasto') as gastos,
      sum(cuota_usd) filter (where tipo = 'ingreso') as ingresos
    from public.movimiento_reparto
    group by socio_id
  ),
  liquidado as (
    select socio_id, sum(enviado) as enviado, sum(recibido) as recibido
    from (
      select de_socio_id as socio_id, monto_usd as enviado, 0 as recibido
      from public.liquidaciones where deleted_at is null
      union all
      select para_socio_id, 0, monto_usd
      from public.liquidaciones where deleted_at is null
    ) l
    group by socio_id
  )
  select
    sa.id as socio_id,
    sa.nombre,
    round(coalesce(b.pagado, 0), 2) as pagado_usd,
    round(coalesce(b.cobrado, 0), 2) as cobrado_usd,
    round(coalesce(t.gastos, 0), 2) as gastos_asignados_usd,
    round(coalesce(t.ingresos, 0), 2) as ingresos_asignados_usd,
    round(coalesce(l.enviado, 0), 2) as liquidado_enviado_usd,
    round(coalesce(l.recibido, 0), 2) as liquidado_recibido_usd,
    round(
      coalesce(b.pagado, 0) - coalesce(t.gastos, 0)
        - coalesce(b.cobrado, 0) + coalesce(t.ingresos, 0)
        + coalesce(l.enviado, 0) - coalesce(l.recibido, 0),
      2
    ) as saldo_usd
  from socios_activos sa
  left join de_su_bolsillo b on b.socio_id = sa.id
  left join le_toca t on t.socio_id = sa.id
  left join liquidado l on l.socio_id = sa.id;

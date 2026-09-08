-- Finanzas v2: reparto explícito por movimiento y movimientos previstos.
--
-- Qué cambia respecto del modelo Splitwise de julio (20260724000002):
--   - El ingreso deja de ir siempre al fondo común. Si un socio cobra un
--     proyecto en su cuenta personal, el movimiento queda con su socio_id y le
--     genera deuda hacia los demás, igual que un gasto se la genera al revés.
--   - El reparto deja de ser implícito (4 partes iguales, siempre). Cada
--     movimiento puede declarar entre quiénes se divide y en qué proporción,
--     en `movimiento_participaciones`. Sin filas = partes iguales entre los
--     socios activos, que es exactamente lo que hacía el modelo anterior: los
--     movimientos históricos no necesitan migrarse.
--   - Un movimiento puede estar `previsto` (comprometido a futuro) y no pesa
--     en el balance hasta que se `confirma`.
--
-- Regla única del balance: un movimiento afecta las cuentas entre socios solo
-- si lo puso o lo cobró un socio (socio_id not null). Lo que entra o sale del
-- fondo común no le genera deuda a nadie.

-- ── Estado del movimiento ─────────────────────────────────────────────────
alter table public.movimientos
  add column estado text not null default 'confirmado'
    check (estado in ('previsto', 'confirmado'));

create index movimientos_estado_idx
  on public.movimientos (estado) where deleted_at is null;

comment on column public.movimientos.socio_id is
  'Quién puso la plata (gasto) o quién la cobró (ingreso). NULL = fondo común.';

-- ── Participaciones ───────────────────────────────────────────────────────
-- Entre quiénes se reparte el movimiento y con cuántas partes cada uno. Las
-- partes son relativas: tres socios con 1, 1, 2 reparten 25/25/50.

create table public.movimiento_participaciones (
  movimiento_id uuid not null
    references public.movimientos (id) on delete cascade,
  socio_id uuid not null references public.socios (id),
  partes numeric(10, 4) not null default 1 check (partes > 0),
  primary key (movimiento_id, socio_id)
);

create index movimiento_participaciones_socio_idx
  on public.movimiento_participaciones (socio_id);

alter table public.movimiento_participaciones enable row level security;

create policy "socios operan participaciones"
  on public.movimiento_participaciones for all
  to authenticated
  using (public.es_socio())
  with check (public.es_socio());

grant select, insert, update, delete
  on public.movimiento_participaciones to service_role;

-- ── Reparto efectivo ──────────────────────────────────────────────────────
-- Una fila por (movimiento, socio) con la cuota que le toca, resolviendo el
-- default de partes iguales cuando el movimiento no declara participaciones.
-- Solo movimientos confirmados puestos o cobrados por un socio: son los
-- únicos que mueven las cuentas entre socios.
--
-- cuota_usd va SIN redondear a propósito: al repartir entre tres, redondear
-- cada cuota dejaría un resto y la suma de los saldos no daría cero. Se
-- redondea recién al agregar.

create view public.movimiento_reparto
  with (security_invoker = on)
  as
  with mov as (
    select m.id, m.tipo, m.socio_id, m.monto_usd
    from public.movimientos m
    where m.deleted_at is null
      and m.estado = 'confirmado'
      and m.socio_id is not null
  ),
  socios_activos as (
    select id from public.socios where deleted_at is null
  ),
  partes as (
    select p.movimiento_id, p.socio_id, p.partes
    from public.movimiento_participaciones p
    join mov on mov.id = p.movimiento_id
    union all
    select mov.id, sa.id, 1
    from mov
    cross join socios_activos sa
    where not exists (
      select 1 from public.movimiento_participaciones p
      where p.movimiento_id = mov.id
    )
  )
  select
    mov.id as movimiento_id,
    mov.tipo,
    mov.socio_id as contraparte_socio_id,
    pt.socio_id,
    mov.monto_usd,
    mov.monto_usd * pt.partes / sum(pt.partes) over (partition by mov.id)
      as cuota_usd
  from mov
  join partes pt on pt.movimiento_id = mov.id;

-- ── Balance de socios ─────────────────────────────────────────────────────
--   pagado_usd    gastos que puso de su bolsillo
--   cobrado_usd   ingresos que entraron a su cuenta personal
--   *_asignados   la parte de esos movimientos que le corresponde a él
--   saldo_usd     (puso − le tocaba) − (cobró − le correspondía)
-- Saldo positivo → los demás le deben; negativo → debe. La suma de los saldos
-- de todos los socios da cero.

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
  )
  select
    sa.id as socio_id,
    sa.nombre,
    round(coalesce(b.pagado, 0), 2) as pagado_usd,
    round(coalesce(b.cobrado, 0), 2) as cobrado_usd,
    round(coalesce(t.gastos, 0), 2) as gastos_asignados_usd,
    round(coalesce(t.ingresos, 0), 2) as ingresos_asignados_usd,
    round(
      coalesce(b.pagado, 0) - coalesce(t.gastos, 0)
        - coalesce(b.cobrado, 0) + coalesce(t.ingresos, 0),
      2
    ) as saldo_usd
  from socios_activos sa
  left join de_su_bolsillo b on b.socio_id = sa.id
  left join le_toca t on t.socio_id = sa.id;

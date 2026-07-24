-- Fase 2 (revisión): modelo Splitwise para finanzas.
--
-- Criterio nuevo (acordado con los socios el 2026-07-24):
--   - Solo se registran INGRESOS y GASTOS. "Aporte" y "retiro" de socio ya no
--     existen como tipos.
--   - Cada movimiento tiene "pagado por" (para gastos) / "recibido por" (para
--     ingresos), representado con socio_id: NOT NULL = ese socio; NULL = fondo
--     común de la empresa.
--   - Los gastos pagados por un socio se reparten en partes iguales entre los
--     4 socios (deuda tipo Splitwise). Los pagados con el fondo común no
--     generan deuda entre socios. Los ingresos van al fondo común.

-- 1. Los movimientos de aporte/retiro quedan obsoletos. El aporte de la seña
--    de la diseñadora ya está representado por el GASTO con socio_id = Joaquín
--    (quien lo pagó), así que el aporte era redundante. Se borran para poder
--    restringir el catálogo de tipos.
delete from public.movimientos where tipo in ('aporte_socio', 'retiro_socio');

-- 2. Restringir el catálogo de tipos a ingreso / gasto.
alter table public.movimientos drop constraint movimientos_tipo_check;
alter table public.movimientos
  add constraint movimientos_tipo_check check (tipo in ('ingreso', 'gasto'));

-- 3. Redefinir la vista balance_socios con lógica Splitwise.
--    pagado_usd  = cuánto puso de su bolsillo cada socio (gastos con su nombre)
--    saldo_usd   = pagado_usd − (total gastado por socios / cantidad de socios)
--    saldo positivo → los demás le deben; negativo → debe.
drop view if exists public.balance_socios;

create view public.balance_socios
  with (security_invoker = on)
  as
  with socios_activos as (
    select id, nombre from public.socios where deleted_at is null
  ),
  gastos_socio as (
    select socio_id, sum(monto_usd) as pagado
    from public.movimientos
    where tipo = 'gasto' and socio_id is not null and deleted_at is null
    group by socio_id
  ),
  totales as (
    select
      coalesce((select sum(pagado) from gastos_socio), 0) as total_pagado,
      (select count(*) from socios_activos) as cant
  )
  select
    sa.id as socio_id,
    sa.nombre,
    round(coalesce(gs.pagado, 0), 2) as pagado_usd,
    round(
      coalesce(gs.pagado, 0)
        - (select total_pagado from totales) / nullif((select cant from totales), 0),
      2
    ) as saldo_usd
  from socios_activos sa
  left join gastos_socio gs on gs.socio_id = sa.id;

-- Carga de movimientos históricos conocidos (Fase 2).
--
-- Criterio acordado: un gasto de la empresa pagado por un socio de su bolsillo
-- se registra como DOS movimientos: el gasto de la empresa (impacta el
-- Resultado) + el aporte del socio que fronteó la plata (impacta el Balance
-- de socios).
--
-- Resuelve los socios por email, así no hace falta ningún UUID. Idempotente:
-- la guarda `not exists` sobre metadata->>'origen' evita duplicar si se corre
-- más de una vez. Ejecutar en el SQL Editor de Supabase.

insert into public.movimientos
  (tipo, fecha, moneda, monto, tc_a_usd, categoria, descripcion, socio_id, created_by, metadata)
select
  v.tipo, v.fecha, v.moneda, v.monto, v.tc_a_usd, v.categoria, v.descripcion,
  v.socio_id, v.socio_id, '{"origen":"carga_historica"}'::jsonb
from (values
  -- Diseño de imagen de marca — seña (460 USD el total; 230 pagados, 230 pendientes).
  -- Joaquín fronteó los 230 de seña el 2026-07-22.
  ('gasto'::text, date '2026-07-22', 'USD'::text, 230::numeric, 1::numeric, 'Diseño'::text,
   'Diseño de imagen de marca — seña (fronteada por Joaquín)'::text,
   (select id from public.socios where email = 'joaquin@zquare.uy')),
  ('aporte_socio', date '2026-07-22', 'USD', 230, 1, null,
   'Seña diseñadora imagen de marca (Joaquín fronteó el pago)',
   (select id from public.socios where email = 'joaquin@zquare.uy'))
) as v(tipo, fecha, moneda, monto, tc_a_usd, categoria, descripcion, socio_id)
where not exists (
  select 1 from public.movimientos m
  where m.metadata->>'origen' = 'carga_historica'
    and m.descripcion = v.descripcion
);

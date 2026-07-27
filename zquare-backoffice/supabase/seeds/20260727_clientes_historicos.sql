-- Carga de clientes y proyectos históricos (migrados de "Cognitiva" a la
-- unidad compartida ZQUARE el 2026-07-27).
--
-- Da de alta Iberpark y Pedro Montero con sus proyectos, y agrega el proyecto
-- PEO al cliente Punta Del Este Operadora (ya existente). Cada uno queda
-- vinculado a su carpeta real de Drive vía drive_folder_id, así las fichas
-- muestran los archivos migrados.
--
-- Idempotente: las guardas `not exists` por nombre evitan duplicar si se
-- corre más de una vez. Ejecutar en el SQL Editor de Supabase.

-- ── Clientes ──────────────────────────────────────────────────────────────

insert into public.clientes
  (nombre, estado, notas, drive_folder_id, created_by, metadata)
select v.nombre, v.estado, v.notas, v.drive_folder_id,
  (select id from public.socios where email = 'joaquin@zquare.uy'),
  '{"origen":"carga_historica"}'::jsonb
from (values
  ('Iberpark',
   'potencial',
   'Cliente histórico migrado de Cognitiva. Propuestas enviadas para Modelo Sommelier y Sistema de contabilidad.',
   '1YQaejXD7HFbqXrBsG27NXzReWW-60_Z_'),
  ('Pedro Montero',
   'inactivo',
   'Cliente histórico migrado de Cognitiva. Proyecto Voice to image cancelado.',
   '1O9nDyOwd3C_hYBvvQV_ys02mdvbirWQx')
) as v(nombre, estado, notas, drive_folder_id)
where not exists (
  select 1 from public.clientes c
  where lower(c.nombre) = lower(v.nombre) and c.deleted_at is null
);

-- Punta Del Este Operadora ya debería existir (dada de alta en el backoffice);
-- por las dudas, si no está, se crea con su carpeta de Drive.
insert into public.clientes (nombre, estado, drive_folder_id, created_by, metadata)
select 'Punta Del Este Operadora', 'potencial', '1zbSmJDIfdsHd7gfvRacMhKwN4G0UNuBi',
  (select id from public.socios where email = 'joaquin@zquare.uy'),
  '{"origen":"carga_historica"}'::jsonb
where not exists (
  select 1 from public.clientes c
  where lower(c.nombre) = lower('Punta Del Este Operadora') and c.deleted_at is null
);

-- ── Proyectos ─────────────────────────────────────────────────────────────

insert into public.proyectos
  (cliente_id, nombre, descripcion, estado, drive_folder_id, created_by, metadata)
select
  (select id from public.clientes c
   where lower(c.nombre) = lower(v.cliente) and c.deleted_at is null),
  v.nombre, v.descripcion, v.estado, v.drive_folder_id,
  (select id from public.socios where email = 'joaquin@zquare.uy'),
  '{"origen":"carga_historica"}'::jsonb
from (values
  ('Iberpark', 'Modelo Sommelier',
   'Chatbot sommelier / vistas de producto para la web. Propuesta y estimación enviadas (junio 2026).',
   'propuesta', '1aE06Z8gPq3dNMb5JhFnq_01pUWwwhdwm'),
  ('Iberpark', 'Sistema contabilidad',
   'Producto de contabilidad: ingreso de facturas (AP). Relevamiento de procedimiento y backlog hechos, propuesta enviada.',
   'propuesta', '19VGGKtYLsqUd0mR_9zugmJ0WJsGlUPQY'),
  ('Pedro Montero', 'Voice to image',
   'Generación de video/imagen a partir de voz. Investigación hecha (deep research); no prosperó.',
   'cancelado', '1vM5dC0CnHnTaQAszVosjH_PTFAdIir-Z'),
  ('Punta Del Este Operadora', 'PEO',
   'Sistema para operadora de turismo: conversor de tarifarios, generador de itinerarios y mail watcher. MVP presentado y entregado.',
   'entregado', '1Xs2T5i3tEkCNbLa8gWG5uuPP5C3Ow69l')
) as v(cliente, nombre, descripcion, estado, drive_folder_id)
where not exists (
  select 1 from public.proyectos p
  join public.clientes c on c.id = p.cliente_id
  where lower(p.nombre) = lower(v.nombre)
    and lower(c.nombre) = lower(v.cliente)
    and p.deleted_at is null
);

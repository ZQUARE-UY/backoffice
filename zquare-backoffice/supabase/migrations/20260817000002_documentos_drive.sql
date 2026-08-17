-- Documentos: Drive pasa a ser la fuente de verdad y la tabla, la anotación.
--
-- La tabla nació en la fase 1 (20260723000003) con un enfoque híbrido: los
-- archivos viven en Drive y acá guardamos metadata para catalogarlos. En ese
-- momento el sistema no tenía forma de saber qué había en Drive, así que un
-- archivo no registrado a mano era invisible. Cuatro días después llegó la
-- búsqueda semántica (20260727000001) y con ella `listarTodosLosArchivos()`,
-- que recorre la unidad compartida entera: la premisa dejó de ser cierta pero
-- la pantalla siguió mostrando solo lo registrado — un documento de 40.
--
-- Ahora /documentos lista lo que hay en Drive y superpone la anotación cuando
-- existe. Eso cambia dos cosas en la tabla:
--
--   drive_file_id  la fila se enlaza con el archivo. Antes solo estaba
--                  `drive_url`, y el índice guarda el file id: no había forma
--                  de unir una anotación con su archivo sin parsear la URL.
--   cliente_id     deja de ser obligatorio. Un archivo suelto (una plantilla,
--                  algo de la empresa) puede merecer un tipo o unos tags sin
--                  pertenecer a ningún cliente.

alter table public.documentos
  add column drive_file_id text;

-- Backfill: el id sale de la URL que ya está guardada. Los dos formatos que
-- devuelve Drive son `/d/<id>/` (archivos y docs nativos) y `?id=<id>`
-- (links viejos de la UI). Lo que no matchee queda en null y se puede
-- reenganchar a mano desde la pantalla.
update public.documentos
set drive_file_id = coalesce(
  substring(drive_url from '/d/([a-zA-Z0-9_-]+)'),
  substring(drive_url from '[?&]id=([a-zA-Z0-9_-]+)')
)
where drive_file_id is null;

-- Una anotación por archivo: dos filas para el mismo documento son dos tipos
-- distintos para la misma cosa. Parcial para no chocar con los borrados.
create unique index documentos_drive_file_idx
  on public.documentos (drive_file_id)
  where deleted_at is null and drive_file_id is not null;

alter table public.documentos alter column cliente_id drop not null;

comment on column public.documentos.drive_file_id is
  'Id del archivo en Drive. Es la clave que une esta anotación con el archivo real y con sus fragmentos en `fragmentos_busqueda` (origen = ''drive'', origen_id = este id).';
comment on table public.documentos is
  'Anotaciones sobre archivos de Drive: tipo, cliente/proyecto, fecha del documento y tags. No es el catálogo de archivos — ese es Drive.';

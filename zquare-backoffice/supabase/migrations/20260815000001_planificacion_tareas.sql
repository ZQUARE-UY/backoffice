-- Tablero v4: los cuatro campos que faltaban para planificar un sprint.
--
-- Vienen del contrato del plugin `zquare` con el backoffice
-- (zquare-standards/plugins/zquare/contrato-backoffice.md). Hasta ahora las
-- skills los emulaban con workarounds que se rompen solos: el código de la US
-- iba como prefijo del título (se pierde si alguien lo edita) y la épica como
-- etiqueta (no se puede agrupar ni contar). La estimación y el MoSCoW
-- directamente no tenían dónde vivir, y sin ellos no se puede calcular la
-- capacidad de un sprint ni la métrica de precisión de estimación.
--
--   codigo_proyecto  US-014 / DEF-07 / SC-3 / TEC-2 — el código DEL PROYECTO,
--                    distinto de `numero` (ZQ-27), que es de la empresa
--   estimacion       puntos de historia en Fibonacci
--   moscow           alcance del release; no es lo mismo que `prioridad`
--   epica            EP-3, para agrupar y avisar cuando una épica queda partida

alter table public.tareas
  add column codigo_proyecto text
    -- Los cuatro prefijos del estándar: User Story, defecto, solicitud de
    -- cambio y trabajo técnico. Mayúsculas para que el código sea uno solo y
    -- no dos que parecen iguales.
    check (codigo_proyecto ~ '^(US|DEF|SC|TEC)-[0-9]+$'),
  add column estimacion smallint
    -- Fibonacci, según 01-gestion-requisitos §3.4. El 13 se admite porque una
    -- tarjeta puede estar estimada en 13 mientras espera que la partan: la
    -- regla "una US de 13 no entra a un sprint" la aplica la planificación,
    -- no la base.
    check (estimacion in (1, 2, 3, 5, 8, 13)),
  add column moscow text
    check (moscow in ('must', 'should', 'could', 'wont')),
  add column epica text
    check (epica ~ '^EP-[0-9]+$');

-- El código es único dentro de su proyecto: dos proyectos distintos pueden
-- tener cada uno su US-014. `nulls not distinct` (PG15+) hace que las tarjetas
-- sin proyecto también choquen entre sí — si no, se podrían crear diez US-014
-- de empresa y el código dejaría de identificar nada.
create unique index tareas_codigo_proyecto_idx
  on public.tareas (proyecto_id, codigo_proyecto) nulls not distinct
  where deleted_at is null and codigo_proyecto is not null;

-- Planificar un sprint es leer el backlog de UN proyecto ordenado. Este índice
-- es el que sostiene esa query.
create index tareas_planificacion_idx
  on public.tareas (proyecto_id, estado, orden)
  where deleted_at is null;

comment on column public.tareas.codigo_proyecto is
  'Código de la tarjeta dentro de su proyecto (US-014, DEF-07). Distinto de `numero`, que es el ZQ-N de la empresa. Es el que enlaza con el requisito y el que usa la convención de ramas del estándar.';
comment on column public.tareas.estimacion is
  'Puntos de historia en Fibonacci. La estima el equipo, no un agente.';
comment on column public.tareas.moscow is
  'Alcance del release (MoSCoW). No confundir con `prioridad`, que es urgencia.';
comment on column public.tareas.epica is
  'Épica a la que pertenece (EP-3). Una tarjeta no puede pertenecer a dos.';

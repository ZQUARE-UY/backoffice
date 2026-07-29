-- Tablero v2: estado `por_hacer`, para separar el backlog del tablero (estilo
-- Jira). `backlog` pasa a ser una lista priorizada aparte (ideas sin
-- compromiso) y el tablero arranca en `por_hacer` (trabajo comprometido).
-- Las tarjetas existentes en `backlog` se quedan ahí a propósito: no se migran
-- datos, cada una se "pasa al tablero" a mano cuando se decide encararla.
-- No hacen falta índices nuevos: tareas_tablero_idx (estado, orden) cubre
-- ambas vistas.

alter table public.tareas drop constraint tareas_estado_check;
alter table public.tareas add constraint tareas_estado_check
  check (estado in ('backlog', 'por_hacer', 'en_curso', 'en_revision', 'hecho'));

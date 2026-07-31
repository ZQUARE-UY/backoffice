-- Graduación de ideas (banco de ideas, etapa 3): una idea aprobada se
-- convierte en proyecto y/o tareas del kanban. Los productos propios que
-- salen del banco (ej. IDEA-1) no tienen cliente: `cliente_id` pasa a ser
-- nullable — null significa "proyecto interno de ZQUARE".

alter table public.proyectos alter column cliente_id drop not null;

-- El endpoint MCP escribe proyectos al graduar (service role, sin RLS).
grant select, insert, update on public.proyectos to service_role;

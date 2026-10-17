-- Más datos de cada conversación del chat de la web, sin guardar IP ni
-- cookies:
-- - De dónde vino: referente (solo el dominio) y UTM que manda la web, y país
--   y ciudad de los headers de Vercel.
-- - Turnos: cuándo escribió cada mensaje la persona, cuánto tardó la
--   respuesta y si tocó una respuesta rápida o lo escribió ella.
-- - Incidentes: rechazos de seguridad, errores de la API y el tope de
--   mensajes, que antes no quedaban en ningún lado.
-- - Valoración 👍/👎 de la persona al final de la charla.
-- - Gestión de los socios: estado (nuevo → revisado → archivado), notas y
--   etiquetas.

alter table public.chats_web
  add column referente text,
  add column utm_source text,
  add column utm_medium text,
  add column utm_campaign text,
  add column pais text,
  add column ciudad text,
  -- Uno por mensaje de la persona: { en, ms, rapida }.
  add column turnos_info jsonb not null default '[]',
  -- { en, tipo: 'rechazo' | 'error' | 'tope_mensajes', mensaje? }.
  add column incidentes jsonb not null default '[]',
  add column valoracion smallint check (valoracion in (-1, 1)),
  add column valoracion_at timestamptz,
  add column estado text not null default 'nuevo'
    check (estado in ('nuevo', 'revisado', 'archivado')),
  add column revisado_por uuid references public.socios (id),
  add column revisado_at timestamptz,
  add column notas text,
  add column etiquetas text[] not null default '{}';

create index chats_web_estado_idx on public.chats_web (estado, updated_at desc) where deleted_at is null;

-- El recorrido de la persona antes del chat sale de eventos_web con el mismo
-- hash de visitante del día.
create index eventos_web_visitante_idx on public.eventos_web (visitante, created_at);

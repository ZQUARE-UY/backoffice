-- Tope de conversaciones nuevas por visitante en el chat de la web: el mismo
-- hash diario de las métricas (IP + navegador + fecha + sal secreta, ver
-- eventos_web), sin guardar la IP. Así una sola persona no agota el tope
-- global y deja el chat sin servicio para el resto.

alter table public.chats_web add column visitante text;

create index chats_web_visitante_idx on public.chats_web (visitante, created_at desc);

-- Contador de uso de APIs pagas (hoy, la API de Claude del chat de la web).
-- Una fila por llamada, con los tokens tal como los devuelve la API y el
-- costo en USD calculado con la tabla de precios de lib/uso-api.ts al
-- momento de la llamada. Es un registro de solo agregar: sin updated_at ni
-- soft delete. Lo escribe el servidor con la service role; los socios lo
-- leen en Inicio (gasto del mes) y en Web → Chats (costo por conversación).

create table public.uso_api (
  id bigint generated always as identity primary key,
  servicio text not null default 'anthropic',
  -- Para qué se usó: 'chat_web' (más adelante, otras funciones).
  funcion text not null,
  modelo text not null,
  tokens_entrada int not null default 0,
  tokens_cache_escritura int not null default 0,
  tokens_cache_lectura int not null default 0,
  tokens_salida int not null default 0,
  costo_usd numeric(12, 6) not null default 0,
  -- A qué pertenece la llamada (el id del chat, por ejemplo).
  referencia uuid,
  -- true en las filas reconstruidas de antes de este registro: el costo es
  -- aproximado (la caché se contó a precio lleno).
  estimado boolean not null default false,
  created_at timestamptz not null default now()
);

create index uso_api_fecha_idx on public.uso_api (created_at);
create index uso_api_referencia_idx on public.uso_api (referencia) where referencia is not null;

alter table public.uso_api enable row level security;

create policy "socios leen uso_api"
  on public.uso_api for select
  to authenticated
  using (public.es_socio());

grant select, insert on public.uso_api to service_role;

-- Costo acumulado de cada conversación del chat.
alter table public.chats_web add column costo_usd numeric(12, 6) not null default 0;

-- Lo gastado antes de este registro, reconstruido de los tokens de cada chat
-- (Claude Haiku 5.5: US$ 0,10 / 0,50 por millón de tokens de entrada / salida).
insert into public.uso_api (funcion, modelo, tokens_entrada, tokens_salida, costo_usd, referencia, estimado, created_at)
select
  'chat_web',
  'claude-haiku-5-5',
  tokens_entrada,
  tokens_salida,
  (tokens_entrada * 0.10 + tokens_salida * 0.50) / 1000000,
  id,
  true,
  created_at
from public.chats_web
where tokens_entrada + tokens_salida > 0;

update public.chats_web
set costo_usd = (tokens_entrada * 0.10 + tokens_salida * 0.50) / 1000000
where tokens_entrada + tokens_salida > 0;

-- Gasto por mes (hora de Montevideo) y función, desde una fecha, calculado
-- en la base (PostgREST corta en 1000 filas). Corre con los permisos de quien
-- la llama: un socio ve todo, cualquier otro nada (RLS).
create or replace function public.uso_api_por_mes(desde timestamptz)
returns table (mes date, funcion text, llamadas bigint, costo_usd numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    date_trunc('month', created_at at time zone 'America/Montevideo')::date as mes,
    funcion,
    count(*) as llamadas,
    sum(costo_usd) as costo_usd
  from public.uso_api
  where created_at >= desde
  group by 1, 2
  order by 1, 2;
$$;

grant execute on function public.uso_api_por_mes(timestamptz) to authenticated;

-- Métricas propias de la web (zquare.uy). La web manda sus eventos (visitas,
-- secciones vistas, scroll, clicks, consultas) a la ruta pública
-- /api/publico/eventos, que los guarda acá con la service role. Sin cookies ni
-- IP: cada visitante es un hash que cambia todos los días (IP + navegador +
-- fecha + sal secreta), así se cuentan visitantes únicos por día sin poder
-- seguir a nadie entre días. Es un registro de solo agregar: sin updated_at
-- ni soft delete.

create table public.eventos_web (
  id bigint generated always as identity primary key,
  evento text not null check (evento in (
    'page_view', 'section_view', 'scroll_depth', 'cta_click', 'email_click',
    'language_change', 'generate_lead', 'form_error', 'cookie_consent'
  )),
  visitante text not null,
  ruta text,
  props jsonb not null default '{}',
  referente text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  pais text,
  dispositivo text check (dispositivo in ('movil', 'tablet', 'escritorio')),
  idioma text check (idioma in ('es', 'en')),
  created_at timestamptz not null default now()
);

create index eventos_web_fecha_idx on public.eventos_web (created_at);
create index eventos_web_evento_fecha_idx on public.eventos_web (evento, created_at);

alter table public.eventos_web enable row level security;

create policy "socios leen eventos_web"
  on public.eventos_web for select
  to authenticated
  using (public.es_socio());

grant select, insert on public.eventos_web to service_role;

-- Resumen para la pestaña Métricas de la sección Web, calculado en la base
-- (PostgREST corta en 1000 filas, así que no se puede agregar en la app).
-- Los días se cuentan en hora de Montevideo. Corre con los permisos de quien
-- la llama: un socio ve todo, cualquier otro nada (RLS).
create or replace function public.metricas_web(desde timestamptz, hasta timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with ev as (
    select *, (created_at at time zone 'America/Montevideo')::date as dia
    from public.eventos_web
    where created_at >= desde and created_at < hasta
  ),
  vistas as (select * from ev where evento = 'page_view'),
  -- Visitante = hash del día: único por día. En un rango, la suma de los
  -- únicos de cada día.
  visitantes as (select distinct dia, visitante from ev),
  origen as (
    select distinct on (dia, visitante)
      dia, visitante,
      coalesce(nullif(utm_source, ''), nullif(referente, ''), 'Directo') as origen,
      coalesce(pais, '—') as pais,
      coalesce(dispositivo, '—') as dispositivo,
      coalesce(idioma, '—') as idioma
    from vistas
    order by dia, visitante, created_at
  )
  select jsonb_build_object(
    'visitantes', (select count(*) from visitantes),
    'vistas', (select count(*) from vistas),
    'leads', (select count(*) from ev where evento = 'generate_lead'),
    'clicks_email', (select count(*) from ev where evento = 'email_click'),
    'por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', dia, 'visitantes', v, 'vistas', p) order by dia)
      from (
        select dia, count(distinct visitante) as v, count(*) filter (where evento = 'page_view') as p
        from ev group by dia
      ) d
    ), '[]'),
    'origenes', coalesce((
      select jsonb_agg(jsonb_build_object('clave', origen, 'n', n) order by n desc)
      from (select origen, count(*) as n from origen group by origen order by n desc limit 8) o
    ), '[]'),
    'paises', coalesce((
      select jsonb_agg(jsonb_build_object('clave', pais, 'n', n) order by n desc)
      from (select pais, count(*) as n from origen group by pais order by n desc limit 8) o
    ), '[]'),
    'dispositivos', coalesce((
      select jsonb_agg(jsonb_build_object('clave', dispositivo, 'n', n) order by n desc)
      from (select dispositivo, count(*) as n from origen group by dispositivo) o
    ), '[]'),
    'idiomas', coalesce((
      select jsonb_agg(jsonb_build_object('clave', idioma, 'n', n) order by n desc)
      from (select idioma, count(*) as n from origen group by idioma) o
    ), '[]'),
    'secciones', coalesce((
      select jsonb_agg(jsonb_build_object('clave', s, 'n', n))
      from (
        select props->>'section' as s, count(distinct (dia, visitante)) as n
        from ev where evento = 'section_view' group by 1
      ) o
    ), '[]'),
    'scroll', coalesce((
      select jsonb_agg(jsonb_build_object('clave', s, 'n', n))
      from (
        select props->>'percent' as s, count(distinct (dia, visitante)) as n
        from ev where evento = 'scroll_depth' group by 1
      ) o
    ), '[]'),
    'ctas', coalesce((
      select jsonb_agg(jsonb_build_object('clave', t, 'n', n) order by n desc)
      from (
        select coalesce(nullif(props->>'label', ''), props->>'target') as t, count(*) as n
        from ev where evento = 'cta_click' group by 1 order by n desc limit 8
      ) o
    ), '[]')
  );
$$;

grant execute on function public.metricas_web(timestamptz, timestamptz) to authenticated;

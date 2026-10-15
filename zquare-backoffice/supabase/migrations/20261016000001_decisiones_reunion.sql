-- Decisión ↔ reunión: de qué reunión salió una decisión. Hasta ahora se
-- deducía buscando una reunión agendada del mismo día con el mismo proyecto o
-- cliente; ahora queda guardado. Una reunión puede tener varias decisiones.

alter table public.decisiones
  add column reunion_id uuid references public.solicitudes_reunion (id);

create index decisiones_reunion_idx on public.decisiones (reunion_id) where deleted_at is null;

-- Relleno con la misma regla que usaba la app, pero solo cuando hay una
-- única reunión candidata (si hay dos ese día, se deja vacío para no
-- adivinar). El día de la reunión se mide en hora de Montevideo.
with candidatas as (
  select d.id as decision_id, min(r.id::text)::uuid as reunion_id, count(*) as n
  from public.decisiones d
  join public.solicitudes_reunion r
    on r.estado = 'agendada'
   and r.inicio is not null
   and r.deleted_at is null
   and (r.inicio at time zone 'America/Montevideo')::date = d.fecha
   and (
     (d.proyecto_id is not null and r.proyecto_id = d.proyecto_id)
     or (d.cliente_id is not null and r.cliente_id = d.cliente_id)
   )
  where d.reunion_id is null
    and d.deleted_at is null
  group by d.id
)
update public.decisiones d
set reunion_id = c.reunion_id
from candidatas c
where c.decision_id = d.id
  and c.n = 1;

-- Votación de ideas "¿La hacemos?" (rediseño): el voto deja de ser un +1 y
-- pasa a tener valor por socio: sí, tengo dudas o no. Sigue habiendo un solo
-- voto por socio por idea (la unique (idea_id, socio_id) no cambia): cambiar
-- de opinión es actualizar el valor.
--
-- Los votos que ya existen eran "a favor": quedan como 'si' por el default.

alter table public.ideas_votos
  add column valor text not null default 'si'
    check (valor in ('si', 'dudas', 'no'));

-- Cuándo se cambió el voto por última vez (el created_at es el del primero).
alter table public.ideas_votos
  add column updated_at timestamptz not null default now();

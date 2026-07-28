-- Embeddings multilingües: de gte-small (384 dim, solo inglés, Edge Function
-- de Supabase) a bge-m3 (1024 dim, multilingüe) vía Cloudflare Workers AI.
-- gte-small rankeaba mal el español (similitudes ~0.8 parejas entre docs
-- correctos e irrelevantes); bge-m3 sí distingue.
--
-- Los vectores viejos son incompatibles (dimensión y modelo distintos):
-- se vacía el índice y se regenera desde /documentos → "Reindexar".

-- La función y el índice dependen de la columna: se recrean.
drop function public.buscar_fragmentos(vector(384), int);
drop index public.fragmentos_busqueda_embedding_idx;

truncate table public.fragmentos_busqueda;

alter table public.fragmentos_busqueda
  alter column embedding type vector(1024);

create index fragmentos_busqueda_embedding_idx
  on public.fragmentos_busqueda
  using hnsw (embedding vector_cosine_ops);

-- Igual que antes, con la dimensión nueva. SQL con security invoker:
-- respeta la RLS.
create function public.buscar_fragmentos(
  consulta vector(1024),
  cantidad int default 8
)
returns table (
  id uuid,
  origen text,
  origen_id text,
  titulo text,
  url text,
  cliente_id uuid,
  fragmento text,
  similitud double precision
)
language sql
stable
as $$
  select
    f.id,
    f.origen,
    f.origen_id,
    f.titulo,
    f.url,
    f.cliente_id,
    f.fragmento,
    1 - (f.embedding <=> consulta) as similitud
  from public.fragmentos_busqueda f
  order by f.embedding <=> consulta
  limit cantidad;
$$;

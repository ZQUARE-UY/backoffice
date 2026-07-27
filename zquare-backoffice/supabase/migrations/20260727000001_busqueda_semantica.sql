-- Fase 4 etapa 1: búsqueda semántica sobre documentos de Drive y decisiones.
--
-- Los textos se trocean en fragmentos y se indexan con embeddings de gte-small
-- (384 dimensiones, generados por la Edge Function `embeddings`). Esta tabla es
-- un índice derivado de los contenidos reales (Drive / decisiones): acá no
-- aplica soft delete — se borra y regenera al reindexar.

create extension if not exists vector;

create table public.fragmentos_busqueda (
  id uuid primary key default gen_random_uuid(),
  -- 'drive': archivo de la unidad compartida; 'decision': fila de decisiones.
  origen text not null check (origen in ('drive', 'decision')),
  -- id del archivo de Drive o uuid de la decisión.
  origen_id text not null,
  titulo text not null,
  -- webViewLink del archivo o ruta interna (/decisiones).
  url text,
  cliente_id uuid references public.clientes (id),
  -- posición del fragmento dentro del documento.
  indice int not null default 0,
  fragmento text not null,
  -- modifiedTime de Drive / updated_at de la decisión: para saltear lo que no cambió.
  modificado timestamptz,
  embedding vector(384) not null,
  created_at timestamptz not null default now()
);

create index fragmentos_busqueda_origen_idx
  on public.fragmentos_busqueda (origen, origen_id);

create index fragmentos_busqueda_embedding_idx
  on public.fragmentos_busqueda
  using hnsw (embedding vector_cosine_ops);

alter table public.fragmentos_busqueda enable row level security;

create policy "socios operan fragmentos_busqueda"
  on public.fragmentos_busqueda for all
  to authenticated
  using (public.es_socio())
  with check (public.es_socio());

-- Búsqueda por similitud coseno. SQL con security invoker: respeta la RLS.
create or replace function public.buscar_fragmentos(
  consulta vector(384),
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

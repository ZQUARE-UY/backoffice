-- Fase 1: documentos.
-- Enfoque híbrido: los archivos viven en Google Drive; acá guardamos metadata
-- y el link, para catalogarlos y encontrarlos por cliente/proyecto.

create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  proyecto_id uuid references public.proyectos (id),
  tipo text not null default 'otro'
    check (tipo in ('analisis', 'propuesta', 'contrato', 'informe', 'minuta', 'otro')),
  titulo text not null,
  drive_url text not null,
  tags text[] not null default '{}',
  fecha date not null default current_date,
  subido_por uuid references public.socios (id),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index documentos_cliente_idx on public.documentos (cliente_id) where deleted_at is null;
create index documentos_proyecto_idx on public.documentos (proyecto_id) where deleted_at is null;
create index documentos_tipo_idx on public.documentos (tipo) where deleted_at is null;

create trigger documentos_updated_at
  before update on public.documentos
  for each row execute function public.set_updated_at();

alter table public.documentos enable row level security;

create policy "socios operan documentos"
  on public.documentos for all
  to authenticated
  using (public.es_socio())
  with check (public.es_socio());

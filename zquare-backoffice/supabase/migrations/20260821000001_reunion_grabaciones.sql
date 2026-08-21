-- Grabación y transcripción de reuniones. El problema que resuelve: lo que se
-- habla en una reunión (por Meet o presencial) se pierde si nadie toma nota.
-- El flujo: desde la página de la reunión se graba el audio (micrófono, y si
-- es por videollamada también el audio de la pestaña compartida) o se sube un
-- archivo de audio ya grabado. El audio va directo a Drive (subida resumable,
-- sin pasar por Vercel), se transcribe con Whisper en Cloudflare Workers AI
-- (misma cuenta y token que los embeddings) y la transcripción final queda
-- como Google Doc en Minutas/ del cliente — con lo cual el indexador de
-- búsqueda semántica la levanta solo en la pasada siguiente.
--
-- Decisiones de diseño:
-- - El audio se graba y se transcribe EN PARTES (el grabador corta cada ~15
--   minutos): cada parte es un archivo webm/opus independiente que entra
--   cómodo en un request a Workers AI y se transcribe dentro del límite de
--   tiempo de una función de Vercel. El cliente repite "transcribir la
--   siguiente parte pendiente" hasta vaciar la cola — el mismo patrón que el
--   indexador de búsqueda.
-- - Una fila por parte, con su transcripción en `texto`: si una parte falla
--   (audio corrupto, límite de tamaño), se reintenta o descarta esa parte sin
--   perder las demás.
-- - El resultado final vive en Drive (`drive_transcripcion_id` en la
--   solicitud), no solo en la base: el pedido original es que quede en el
--   Drive de la empresa para usarse después, y de paso el índice semántico
--   lo indexa como cualquier otro documento.

create table public.reunion_grabaciones (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null
    references public.solicitudes_reunion (id) on delete cascade,
  -- Orden de la parte dentro de la reunión (1, 2, 3...).
  parte integer not null,
  nombre text not null,
  -- Archivo de audio en Drive (subido por el navegador con sesión resumable).
  drive_audio_id text not null,
  drive_audio_url text,
  estado text not null default 'subida'
    check (estado in ('subida', 'transcripta', 'error')),
  -- Transcripción de esta parte (Whisper). Se concatena con las demás para
  -- armar el Google Doc final.
  texto text,
  error text,
  created_by uuid references public.socios (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (solicitud_id, parte)
);

create index reunion_grabaciones_solicitud_idx
  on public.reunion_grabaciones (solicitud_id, parte);

create trigger reunion_grabaciones_updated_at
  before update on public.reunion_grabaciones
  for each row execute function public.set_updated_at();

alter table public.reunion_grabaciones enable row level security;

create policy "socios operan grabaciones de reunion"
  on public.reunion_grabaciones for all
  to authenticated
  using (public.es_socio())
  with check (public.es_socio());

-- El Google Doc con la transcripción completa, una vez armado. Vive en la
-- solicitud porque la solicitud ES la reunión (misma decisión de siempre).
alter table public.solicitudes_reunion
  add column drive_transcripcion_id text,
  add column drive_transcripcion_url text;

-- Grant explícito para el endpoint MCP (service role key, sin RLS).
grant select, insert, update, delete
  on public.reunion_grabaciones
  to service_role;

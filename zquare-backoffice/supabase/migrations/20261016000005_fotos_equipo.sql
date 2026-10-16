-- Fotos del equipo de la web (Web → Contenido → Equipo). Se guardan en un
-- bucket público de Supabase Storage ("web"): la web las muestra directo por
-- su URL pública. Las sube el backoffice con la service role (después de
-- verificar que quien sube es socio), así que no hacen falta policies de
-- escritura sobre storage.objects.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('web', 'web', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

alter table public.socios add column web_foto_url text;

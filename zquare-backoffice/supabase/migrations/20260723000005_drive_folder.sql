-- Integración con Drive: guardamos el id de la carpeta de Drive de cada
-- cliente y proyecto para listar sus archivos y no recrearla.

alter table public.clientes add column if not exists drive_folder_id text;
alter table public.proyectos add column if not exists drive_folder_id text;

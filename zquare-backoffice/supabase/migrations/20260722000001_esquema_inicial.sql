-- Esquema inicial del backoffice ZQUARE.
-- Principios (ver PLAN.md sección 4): toda tabla lleva id uuid, created_at,
-- updated_at y soft delete via deleted_at. RLS en todas las tablas: solo
-- socios registrados pueden operar.

-- ── Utilidades ────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Socios ────────────────────────────────────────────────────────────────

create table public.socios (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id),
  nombre text not null,
  email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger socios_updated_at
  before update on public.socios
  for each row execute function public.set_updated_at();

-- La allowlist: solo emails presentes en esta tabla son socios válidos.
create or replace function public.es_socio()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.socios s
    where s.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and s.deleted_at is null
  );
$$;

alter table public.socios enable row level security;

create policy "solo socios leen socios"
  on public.socios for select
  to authenticated
  using (public.es_socio());

create policy "solo socios actualizan socios"
  on public.socios for update
  to authenticated
  using (public.es_socio())
  with check (public.es_socio());

-- Al crearse el usuario en auth (primer login con Google), se vincula con su
-- fila en socios por email.
create or replace function public.vincular_socio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.socios
  set auth_user_id = new.id
  where lower(email) = lower(new.email)
    and auth_user_id is null;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.vincular_socio();

-- ── Datos iniciales ───────────────────────────────────────────────────────

insert into public.socios (nombre, email) values
  ('Joaquín', 'joaquin@zquare.uy'),
  ('Nicolás', 'nicolas@zquare.uy'),
  ('Francisco', 'francisco@zquare.uy'),
  ('Martín', 'martin@zquare.uy');

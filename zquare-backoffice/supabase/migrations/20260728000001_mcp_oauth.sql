-- Fase 4: OAuth 2.1 para el MCP server, para conectarlo desde claude.ai
-- (web y celular), que no permite pegar un token bearer a mano.
--
-- El backoffice actúa como authorization server: los clientes MCP se
-- registran solos (RFC 7591), el socio aprueba en /oauth/autorizar con su
-- sesión de Google, y el access token resultante autentica /api/mcp/mcp.
-- Los tokens son opacos y se guardan hasheados (sha256): la DB nunca tiene
-- el secreto en claro. Tablas operadas solo con la service role key, igual
-- que el resto del flujo MCP: RLS prendida sin políticas.

-- Clientes OAuth registrados dinámicamente (claude.ai, inspector, etc.).
create table public.mcp_oauth_clientes (
  client_id text primary key,
  nombre text not null,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);

-- Códigos de autorización: un solo uso, vida corta, atados a PKCE (S256).
create table public.mcp_oauth_codigos (
  codigo_hash text primary key,
  client_id text not null references public.mcp_oauth_clientes (client_id),
  socio_email text not null,
  redirect_uri text not null,
  code_challenge text not null,
  scope text,
  expira_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Tokens emitidos: access + refresh (rotado en cada uso), ambos hasheados.
create table public.mcp_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.mcp_oauth_clientes (client_id),
  socio_email text not null,
  access_hash text not null unique,
  refresh_hash text unique,
  access_expira_at timestamptz not null,
  refresh_expira_at timestamptz,
  revocado_at timestamptz,
  created_at timestamptz not null default now(),
  ultimo_uso_at timestamptz
);

create index mcp_oauth_tokens_socio_idx
  on public.mcp_oauth_tokens (socio_email);

-- Sin políticas: ningún rol de la API (anon/authenticated) puede tocarlas;
-- solo la service role key del endpoint MCP y de las rutas OAuth.
alter table public.mcp_oauth_clientes enable row level security;
alter table public.mcp_oauth_codigos enable row level security;
alter table public.mcp_oauth_tokens enable row level security;

-- Grant explícito: las imágenes nuevas de Postgres de Supabase ya no dan DML
-- a service_role por default privileges sobre tablas creadas por `postgres`.
grant select, insert, update, delete
  on public.mcp_oauth_clientes, public.mcp_oauth_codigos, public.mcp_oauth_tokens
  to service_role;

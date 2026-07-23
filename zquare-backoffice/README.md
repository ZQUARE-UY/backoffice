# ZQUARE · Backoffice de gestión

Plataforma interna de gestión para los 4 socios de ZQUARE. Plan completo y
decisiones de arquitectura en [`../PLAN.md`](../PLAN.md).

Stack: Next.js 16 (App Router) · Supabase (Postgres + Auth) · Tailwind v4 + shadcn/ui.

## Configuración inicial (una sola vez)

### 1. Supabase

1. Crear proyecto en [supabase.com](https://supabase.com) (organización ZQUARE,
   región `South America (São Paulo)`).
2. En **SQL Editor**, ejecutar el contenido de
   `supabase/migrations/20260722000001_esquema_inicial.sql`
   (o usar `supabase db push` con el CLI).
3. En **Authentication → Providers → Google**: habilitar el proveedor y pegar
   el Client ID y Client Secret del paso 2.
4. En **Authentication → URL Configuration**: agregar
   `http://localhost:3000/**` y la URL de producción a *Redirect URLs*.

### 2. Google OAuth (consola de Google Cloud, con cuenta @zquare.uy)

1. Crear proyecto en [console.cloud.google.com](https://console.cloud.google.com).
2. **APIs & Services → OAuth consent screen**: tipo *Internal* (solo cuentas
   del Workspace zquare.uy — primera barrera de acceso).
3. **Credentials → Create credentials → OAuth client ID** (tipo *Web application*):
   - Authorized redirect URI: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
     (aparece en Supabase al habilitar el proveedor Google).
4. Copiar Client ID y Secret a Supabase (paso 1.3).

### 3. Variables de entorno

```bash
cp .env.example .env.local
# completar con URL y anon key del proyecto Supabase
```

### 4. Correr en desarrollo

```bash
npm install
npm run dev
```

## Seguridad

Tres capas para que solo entren los 4 socios:

1. OAuth consent *Internal*: Google solo permite cuentas del Workspace.
2. Allowlist en el proxy (`src/lib/socios.ts`): cualquier otra cuenta es
   deslogueada y redirigida a `/acceso-denegado`.
3. RLS en Postgres (`es_socio()`): aunque alguien obtuviera una sesión, la
   base no le devuelve ni acepta datos.

## Estructura

```
src/
├── app/
│   ├── (protegido)/     # rutas detrás del login
│   ├── login/
│   ├── auth/callback/   # intercambio del código OAuth
│   └── acceso-denegado/
├── components/          # ui/ = shadcn, resto propios
├── lib/
│   ├── supabase/        # clientes browser/server/proxy
│   └── socios.ts        # allowlist
└── proxy.ts             # auth gate (Next 16: ex middleware)
supabase/migrations/     # esquema versionado de la DB
```

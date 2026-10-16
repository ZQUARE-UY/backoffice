import "server-only"

import { createClient as crearClienteSupabase } from "@supabase/supabase-js"

// Cliente con la service role key (server-only, salta RLS). Se usa solo donde
// no hay sesión de Supabase Auth y el control de acceso lo hace la ruta: el
// endpoint MCP (token bearer por socio), los crons (CRON_SECRET) y las rutas
// públicas de la web (origen y límites, ver lib/consultas-web.ts).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")
  }
  return crearClienteSupabase(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

import "server-only"

import { createClient as crearClienteSupabase } from "@supabase/supabase-js"

// Cliente con la service role key (server-only, salta RLS). Se usa SOLO en el
// endpoint MCP, donde el control de acceso lo hace el token bearer por socio
// (no hay sesión de Supabase Auth en ese contexto).
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

import { createClient } from "@/lib/supabase/server"

import { FILTROS, VistaWeb, type Consulta } from "./vista-web"

export const metadata = { title: "Web" }

// Sección Web: trae las consultas del filtro y la elegida; la vista está en
// vista-web.tsx.
export default async function WebPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; consulta?: string }>
}) {
  const { estado: estadoParam, consulta: elegidaParam } = await searchParams
  const filtro = FILTROS.find((f) => f.valor === estadoParam)?.valor ?? "nueva"
  const supabase = await createClient()

  let consulta = supabase
    .from("consultas_web")
    .select("*, clientes(id, nombre), chats_web(id)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
  if (filtro !== "todas") consulta = consulta.eq("estado", filtro)
  const { data } = await consulta
  const consultas = (data ?? []) as unknown as Consulta[]

  // Si la elegida ya no está en el filtro (se marcó atendida o se descartó),
  // se muestra la primera de la lista.
  const elegida = consultas.find((c) => c.id === elegidaParam) ?? consultas[0] ?? null
  const existente = elegida && !elegida.cliente_id ? await clienteConEmail(elegida.email) : null

  return (
    <VistaWeb
      consultas={consultas}
      filtro={filtro}
      elegida={elegida}
      elegidaEnUrl={!!elegidaParam}
      existente={existente}
    />
  )
}

// ¿Ya es cliente? Mismo email, sin importar mayúsculas (el _ se escapa para
// que ilike no lo tome como comodín).
async function clienteConEmail(email: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("clientes")
    .select("id, nombre")
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .is("deleted_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle<{ id: string; nombre: string }>()
  return data
}


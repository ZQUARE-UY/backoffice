"use server"

import { createClient } from "@/lib/supabase/server"

export type ResultadoBusqueda = {
  kind: "cliente" | "proyecto" | "documento"
  id: string
  titulo: string
  subtitulo: string | null
  href: string
}

type FilaCliente = { nombre: string } | { nombre: string }[] | null

function nombreCliente(rel: FilaCliente): string | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0]?.nombre ?? null) : rel.nombre
}

export async function buscar(query: string): Promise<ResultadoBusqueda[]> {
  const q = query.trim()
  if (q.length < 2) return []

  // Sanitizo para el filtro .or() de PostgREST (comas/paréntesis rompen la
  // sintaxis) y escapo los comodines de ilike.
  const limpio = q.replace(/[(),*%_]/g, " ").trim()
  if (!limpio) return []
  const like = `%${limpio}%`

  const supabase = await createClient()

  const [clientes, proyectos, documentos] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nombre, empresa")
      .is("deleted_at", null)
      .or(`nombre.ilike.${like},empresa.ilike.${like}`)
      .limit(6),
    supabase
      .from("proyectos")
      .select("id, nombre, clientes(nombre)")
      .is("deleted_at", null)
      .ilike("nombre", like)
      .limit(6),
    supabase
      .from("documentos")
      .select("id, titulo, cliente_id, clientes(nombre)")
      .is("deleted_at", null)
      .ilike("titulo", like)
      .limit(6),
  ])

  const resultados: ResultadoBusqueda[] = []

  for (const c of clientes.data ?? []) {
    resultados.push({
      kind: "cliente",
      id: c.id,
      titulo: c.nombre,
      subtitulo: c.empresa ?? null,
      href: `/clientes/${c.id}`,
    })
  }
  for (const p of proyectos.data ?? []) {
    resultados.push({
      kind: "proyecto",
      id: p.id,
      titulo: p.nombre,
      subtitulo: nombreCliente(p.clientes as FilaCliente),
      href: `/proyectos/${p.id}`,
    })
  }
  for (const d of documentos.data ?? []) {
    // Los documentos no tienen ficha propia; llevan a la de su cliente.
    resultados.push({
      kind: "documento",
      id: d.id,
      titulo: d.titulo,
      subtitulo: nombreCliente(d.clientes as FilaCliente),
      href: `/clientes/${d.cliente_id}`,
    })
  }

  return resultados
}

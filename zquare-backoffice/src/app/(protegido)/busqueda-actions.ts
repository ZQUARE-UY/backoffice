"use server"

import {
  codigoTarea,
  ESTADOS_TAREA,
  type EstadoTarea,
} from "@/lib/dominio"
import { generarEmbeddings } from "@/lib/embeddings"
import { createClient } from "@/lib/supabase/server"

export type ResultadoBusqueda = {
  kind: "cliente" | "proyecto" | "documento" | "tarea" | "contenido"
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

  const [clientes, proyectos, documentos, tareas] = await Promise.all([
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
    supabase
      .from("tareas")
      .select("id, numero, titulo, estado")
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
  for (const t of tareas.data ?? []) {
    // Las tarjetas se abren desde el tablero; no tienen ruta propia.
    resultados.push({
      kind: "tarea",
      id: t.id,
      titulo: t.titulo,
      subtitulo: `${codigoTarea(t.numero)} · ${ESTADOS_TAREA[t.estado as EstadoTarea]?.label ?? t.estado}`,
      href: "/tareas",
    })
  }

  return resultados
}

// Umbral de similitud coseno (bge-m3): por debajo el resultado suele ser
// ruido. Calibrado con el corpus real en español al migrar (2026-07-28):
// los aciertos caen entre ~0.47 y ~0.61, el ruido entre ~0.41 y ~0.54 —
// 0.45 prioriza no ocultar el doc correcto a costa de algún resultado de
// más, que en una búsqueda es el trade-off correcto.
const UMBRAL_SIMILITUD = 0.45

type Fragmento = {
  origen: "drive" | "decision"
  origen_id: string
  titulo: string
  url: string | null
  fragmento: string
  similitud: number
}

// Búsqueda semántica sobre el contenido indexado (archivos de Drive y
// decisiones). Devuelve [] si el índice está vacío o Workers AI no está
// configurado — el Cmd+K sigue funcionando igual.
export async function buscarContenido(
  query: string
): Promise<ResultadoBusqueda[]> {
  const q = query.trim()
  if (q.length < 4) return []

  try {
    const [embedding] = await generarEmbeddings([q])
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("buscar_fragmentos", {
      consulta: JSON.stringify(embedding),
      cantidad: 8,
    })
    if (error) return []

    const vistos = new Set<string>()
    const resultados: ResultadoBusqueda[] = []
    for (const f of (data ?? []) as Fragmento[]) {
      // Un resultado por documento (el fragmento más parecido llega primero).
      if (f.similitud < UMBRAL_SIMILITUD || vistos.has(f.origen_id)) continue
      vistos.add(f.origen_id)
      resultados.push({
        kind: "contenido",
        id: f.origen_id,
        titulo: f.titulo,
        subtitulo: f.fragmento.slice(0, 80),
        href: f.url ?? "/documentos",
      })
    }
    return resultados.slice(0, 5)
  } catch {
    return []
  }
}

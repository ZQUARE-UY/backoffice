"use server"

import { revalidatePath } from "next/cache"

import { esTipo, TIPOS, type TipoBloque } from "@/lib/contenido-web"
import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"

function texto(formData: FormData, clave: string, max: number): string {
  return ((formData.get(clave) as string | null) ?? "").trim().slice(0, max)
}

// Arma { es, en, nombre?, empresa? } desde el formulario (campos `es.titulo`,
// `en.titulo`, `nombre`…). El español es obligatorio; el inglés, si falta, la
// web lo completa con el español.
function datosDelFormulario(tipo: TipoBloque, formData: FormData) {
  const def = TIPOS[tipo]
  const es: Record<string, string> = {}
  const en: Record<string, string> = {}
  for (const c of def.campos) {
    es[c.clave] = texto(formData, `es.${c.clave}`, c.max)
    en[c.clave] = texto(formData, `en.${c.clave}`, c.max)
  }
  const obligatorio = def.campos[0]
  if (!es[obligatorio.clave]) throw new Error(`Falta ${obligatorio.label.toLowerCase()} en español`)
  const compartidos: Record<string, string | null> = {}
  for (const c of def.compartidos ?? []) compartidos[c.clave] = texto(formData, c.clave, c.max) || null
  return { es, en, ...compartidos }
}

function revalidar() {
  revalidatePath("/web/contenido")
}

export async function crearBloque(tipo: string, formData: FormData) {
  if (!esTipo(tipo)) throw new Error("Tipo inválido")
  const supabase = await createClient()
  const { data: ultimo } = await supabase
    .from("contenido_web")
    .select("orden")
    .eq("tipo", tipo)
    .is("deleted_at", null)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle<{ orden: number }>()
  const { error } = await supabase.from("contenido_web").insert({
    tipo,
    orden: (ultimo?.orden ?? 0) + 1,
    ...datosDelFormulario(tipo, formData),
    created_by: await idSocioActual(),
  })
  if (error) throw new Error(error.message)
  revalidar()
}

export async function actualizarBloque(id: string, tipo: string, formData: FormData) {
  if (!esTipo(tipo)) throw new Error("Tipo inválido")
  const supabase = await createClient()
  const { error } = await supabase.from("contenido_web").update(datosDelFormulario(tipo, formData)).eq("id", id)
  if (error) throw new Error(error.message)
  revalidar()
}

export async function publicarBloque(id: string, publicado: boolean) {
  const supabase = await createClient()
  const { error } = await supabase.from("contenido_web").update({ publicado }).eq("id", id)
  if (error) throw new Error(error.message)
  revalidar()
}

export async function eliminarBloque(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("contenido_web").update({ deleted_at: new Date().toISOString() }).eq("id", id)
  if (error) throw new Error(error.message)
  revalidar()
}

// Sube o baja un bloque dentro de su tipo: renumera la lista entera (son
// pocos) para que el orden quede siempre 1, 2, 3…
export async function moverBloque(id: string, tipo: string, direccion: -1 | 1) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("contenido_web")
    .select("id")
    .eq("tipo", tipo)
    .is("deleted_at", null)
    .order("orden")
    .order("created_at")
  const ids = ((data ?? []) as { id: string }[]).map((b) => b.id)
  const i = ids.indexOf(id)
  const j = i + direccion
  if (i < 0 || j < 0 || j >= ids.length) return
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  await Promise.all(ids.map((bid, n) => supabase.from("contenido_web").update({ orden: n + 1 }).eq("id", bid)))
  revalidar()
}

// Equipo de la web: un socio aparece o no, con su cargo en los dos idiomas.
export async function actualizarSocioWeb(id: string, formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("socios")
    .update({
      web_visible: formData.get("web_visible") === "on",
      web_cargo_es: texto(formData, "web_cargo_es", 80) || null,
      web_cargo_en: texto(formData, "web_cargo_en", 80) || null,
    })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidar()
}

export async function moverSocio(id: string, direccion: -1 | 1) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("socios")
    .select("id")
    .is("deleted_at", null)
    .order("web_orden")
    .order("nombre")
  const ids = ((data ?? []) as { id: string }[]).map((s) => s.id)
  const i = ids.indexOf(id)
  const j = i + direccion
  if (i < 0 || j < 0 || j >= ids.length) return
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  await Promise.all(ids.map((sid, n) => supabase.from("socios").update({ web_orden: n + 1 }).eq("id", sid)))
  revalidar()
}

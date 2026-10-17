"use server"

import { revalidatePath } from "next/cache"

import {
  CLAVE_CONFIG_SECCIONES,
  esTipo,
  leerSecciones,
  TIPOS,
  type Bloque,
  type Secciones,
  type SocioWeb,
  type TipoBloque,
} from "@/lib/contenido-web"
import { idSocioActual } from "@/lib/socio-actual"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type BorradorBloque = Bloque & { nuevo?: boolean; eliminado?: boolean }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function recortar(valor: unknown, max: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, max) : ""
}

// Solo los campos del tipo, recortados a su largo máximo.
function limpiarTextos(tipo: TipoBloque, textos: Record<string, string> | undefined) {
  const limpio: Record<string, string> = {}
  for (const c of TIPOS[tipo].campos) limpio[c.clave] = recortar(textos?.[c.clave], c.max)
  return limpio
}

// Publica el borrador del editor de una vez: altas, cambios, bajas y el
// orden de cada lista (el del borrador), más el equipo y qué secciones se ven. Valida todo antes
// de escribir, así un error no deja la web a medio publicar.
export async function publicarContenido(borrador: { bloques: BorradorBloque[]; socios: SocioWeb[]; secciones: Secciones }) {
  const socio = await idSocioActual()
  if (!socio) throw new Error("No autorizado")

  const vivos = borrador.bloques.filter((b) => !b.eliminado)
  for (const b of borrador.bloques) {
    if (!esTipo(b.tipo) || !UUID.test(b.id)) throw new Error("Contenido inválido")
  }
  for (const b of vivos) {
    const def = TIPOS[b.tipo]
    if (!recortar(b.es?.[def.campos[0].clave], 1)) {
      throw new Error(`Falta ${def.campos[0].label.toLowerCase()} en español en un ${def.singular}`)
    }
  }

  const ordenEnSuTipo = new Map<string, number>()
  for (const tipo of Object.keys(TIPOS)) {
    vivos.filter((b) => b.tipo === tipo).forEach((b, i) => ordenEnSuTipo.set(b.id, i + 1))
  }

  const supabase = await createClient()
  const ahora = new Date().toISOString()
  const operaciones = borrador.bloques.map((b) => {
    if (b.eliminado) {
      return b.nuevo ? null : supabase.from("contenido_web").update({ deleted_at: ahora }).eq("id", b.id)
    }
    const fila = {
      tipo: b.tipo,
      orden: ordenEnSuTipo.get(b.id) ?? 0,
      publicado: !!b.publicado,
      es: limpiarTextos(b.tipo, b.es),
      en: limpiarTextos(b.tipo, b.en),
      nombre: TIPOS[b.tipo].compartidos ? recortar(b.nombre, 80) || null : null,
      empresa: TIPOS[b.tipo].compartidos ? recortar(b.empresa, 80) || null : null,
    }
    return b.nuevo
      ? supabase.from("contenido_web").insert({ id: b.id, ...fila, created_by: socio })
      : supabase.from("contenido_web").update(fila).eq("id", b.id)
  })
  borrador.socios.forEach((s, i) => {
    if (!UUID.test(s.id)) throw new Error("Contenido inválido")
    operaciones.push(
      supabase
        .from("socios")
        .update({
          web_visible: !!s.web_visible,
          web_orden: i + 1,
          web_cargo_es: recortar(s.web_cargo_es, 80) || null,
          web_cargo_en: recortar(s.web_cargo_en, 80) || null,
        })
        .eq("id", s.id)
    )
  })

  operaciones.push(
    supabase.from("configuracion").upsert({
      clave: CLAVE_CONFIG_SECCIONES,
      valor: leerSecciones(borrador.secciones),
      descripcion: "Secciones de zquare.uy que se muestran (Web → Contenido)",
      updated_by: socio,
    })
  )

  const resultados = await Promise.all(operaciones)
  const error = resultados.find((r) => r?.error)?.error
  if (error) throw new Error(`No se pudo publicar todo: ${error.message}`)
  revalidatePath("/web/contenido")
}

const BUCKET = "web"

// Foto del socio para la web. Llega ya recortada y achicada por el navegador
// (webp de ~800px, ver foto-socio.tsx). A diferencia del texto, la foto se
// publica en el momento (no pasa por el borrador). Se sube con la service role, así que
// primero se verifica que quien llama sea socio. Cada foto va con un nombre
// nuevo (así ningún caché muestra la vieja) y la anterior se borra.
export async function subirFotoSocio(id: string, formData: FormData): Promise<string> {
  if (!(await idSocioActual())) throw new Error("No autorizado")
  const archivo = formData.get("foto")
  if (!(archivo instanceof File) || archivo.size === 0) throw new Error("Falta la foto")
  if (!["image/webp", "image/jpeg", "image/png"].includes(archivo.type)) throw new Error("La foto tiene que ser una imagen")
  if (archivo.size > 1_500_000) throw new Error("La foto es demasiado pesada")

  const admin = createAdminClient()
  const extension = archivo.type.split("/")[1]
  const ruta = `equipo/${id}-${Date.now()}.${extension}`
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(ruta, archivo, { contentType: archivo.type, cacheControl: "31536000" })
  if (error) throw new Error(`No se pudo subir la foto: ${error.message}`)
  const url = admin.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl

  await reemplazarFoto(id, url)
  return url
}

export async function quitarFotoSocio(id: string) {
  if (!(await idSocioActual())) throw new Error("No autorizado")
  await reemplazarFoto(id, null)
}

async function reemplazarFoto(id: string, url: string | null) {
  const supabase = await createClient()
  const { data: antes } = await supabase.from("socios").select("web_foto_url").eq("id", id).single<{ web_foto_url: string | null }>()
  const { error } = await supabase.from("socios").update({ web_foto_url: url }).eq("id", id)
  if (error) throw new Error(error.message)

  // La anterior ya no la usa nadie (tolerante: si falla, queda huérfana).
  const marca = `/object/public/${BUCKET}/`
  const vieja = antes?.web_foto_url?.split(marca)[1]
  if (vieja) await createAdminClient().storage.from(BUCKET).remove([vieja]).catch(() => null)
  revalidatePath("/web/contenido")
}

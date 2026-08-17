"use server"

import { revalidatePath } from "next/cache"

import {
  CAMPOS_BRIEF_MINIMO,
  CAMPOS_BRIEF_PROYECTO,
  type CampoBriefProyecto,
} from "@/lib/dominio"
import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"

function textoOpcional(valor: FormDataEntryValue | null): string | null {
  const t = (valor as string | null)?.trim()
  return t ? t : null
}

// Snapshot del contenido tras cada edición, igual que en ideas y tareas: el
// autor lo sabe quien escribe, no un trigger.
async function guardarVersion(
  proyectoId: string,
  proyecto: Record<string, unknown>
) {
  const supabase = await createClient()
  const socioId = await idSocioActual()
  const { data: socio } = socioId
    ? await supabase.from("socios").select("nombre").eq("id", socioId).maybeSingle()
    : { data: null }

  const snapshot: Record<string, unknown> = {}
  for (const campo of [
    "nombre",
    "descripcion",
    "estado",
    "tipo",
    ...CAMPOS_BRIEF_PROYECTO,
  ]) {
    snapshot[campo] = proyecto[campo]
  }

  await supabase.from("proyectos_versiones").insert({
    proyecto_id: proyectoId,
    snapshot,
    autor: socio?.nombre ?? "Socio",
    autor_socio_id: socioId,
  })
}

// Edición manual del brief de arranque. Es el complemento del prompt MCP: la
// entrevista con Claude es para armarlo, esto es para corregirlo sin abrir un
// chat.
export async function actualizarBriefProyecto(id: string, formData: FormData) {
  const supabase = await createClient()

  const cambios: Record<string, string | null> = {}
  for (const campo of CAMPOS_BRIEF_PROYECTO) {
    cambios[campo] = textoOpcional(formData.get(campo))
  }

  const { data, error } = await supabase
    .from("proyectos")
    .update(cambios)
    .eq("id", id)
    .select("*")
    .single()
  if (error) throw new Error(error.message)

  await guardarVersion(id, data)
  revalidatePath(`/proyectos/${id}`)
  revalidatePath("/proyectos")
}

// Marca el arranque a mano, para los proyectos que se arrancaron sin pasar por
// la entrevista (o que ya venían arrancados de antes). Mismas reglas que la
// tool MCP `comenzar_proyecto`: sin el brief mínimo no se cierra el arranque,
// porque el punto del inicializador es justamente que ese mínimo exista.
export async function marcarProyectoComenzado(id: string) {
  const supabase = await createClient()

  const { data: proyecto, error: errorLectura } = await supabase
    .from("proyectos")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single()
  if (errorLectura) throw new Error(errorLectura.message)

  if (proyecto.kickoff_completado_at) {
    throw new Error("Este proyecto ya figura como comenzado.")
  }

  const faltantes = CAMPOS_BRIEF_MINIMO.filter(
    (campo) => !proyecto[campo as CampoBriefProyecto]
  )
  if (faltantes.length > 0) {
    throw new Error(
      `Falta completar el brief antes de comenzar: ${faltantes.join(", ")}.`
    )
  }
  if (!proyecto.tipo) {
    throw new Error("Falta elegir el tipo de proyecto antes de comenzarlo.")
  }
  if (!proyecto.responsable_id) {
    throw new Error("Falta asignar el socio responsable antes de comenzarlo.")
  }

  const socioId = await idSocioActual()
  const { data: socio } = socioId
    ? await supabase.from("socios").select("nombre").eq("id", socioId).maybeSingle()
    : { data: null }

  const ahora = new Date()
  const { data, error } = await supabase
    .from("proyectos")
    .update({
      estado: "en_curso",
      fecha_inicio: proyecto.fecha_inicio ?? ahora.toISOString().slice(0, 10),
      kickoff_completado_at: ahora.toISOString(),
      kickoff_por: socio?.nombre ?? "Socio",
    })
    .eq("id", id)
    .select("*")
    .single()
  if (error) throw new Error(error.message)

  await guardarVersion(id, data)
  revalidatePath(`/proyectos/${id}`)
  revalidatePath("/proyectos")
}

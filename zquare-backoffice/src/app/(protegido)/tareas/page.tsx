import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { numeroDeParam, VistaTareas, type ParamsTareas } from "./vista-tareas"

export const metadata = { title: "Tareas" }

export default async function TareasPage({
  searchParams,
}: {
  searchParams: Promise<ParamsTareas>
}) {
  const params = await searchParams
  const { vista, ...resto } = params
  const qs = new URLSearchParams(
    Object.entries(resto).filter((e): e is [string, string] => typeof e[1] === "string")
  ).toString()

  // Links viejos (`?vista=backlog`, `?vista=calendario`): cada vista es ahora
  // su propia ruta.
  if (vista === "backlog" || vista === "calendario") {
    redirect(`/tareas/${vista}${qs ? `?${qs}` : ""}`)
  }

  // Un deep link a una tarjeta del backlog se abre en la vista Backlog.
  const tareaAbierta = numeroDeParam(params.tarea)
  if (tareaAbierta !== undefined) {
    const supabase = await createClient()
    const { data } = await supabase
      .from("tareas")
      .select("estado")
      .eq("numero", tareaAbierta)
      .is("deleted_at", null)
      .maybeSingle()
    if (data?.estado === "backlog") redirect(`/tareas/backlog${qs ? `?${qs}` : ""}`)
  }

  return <VistaTareas vista="tablero" params={resto} />
}

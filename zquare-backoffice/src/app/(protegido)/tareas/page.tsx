import { type ComentarioTarea, type Socio, type Tarea } from "@/lib/dominio"
import { createClient } from "@/lib/supabase/server"

import { type ProyectoOpcion } from "./campos-tarea"
import { NuevaTarea } from "./nueva-tarea"
import { Tablero } from "./tablero"

export const metadata = { title: "Tareas" }

type ProyectoConCliente = {
  id: string
  nombre: string
  clientes: { nombre: string } | null
}

export default async function TareasPage() {
  const supabase = await createClient()

  const [
    { data: tareasData },
    { data: comentariosData },
    { data: sociosData },
    { data: clientesData },
    { data: proyectosData },
  ] = await Promise.all([
    supabase
      .from("tareas")
      .select("*")
      .is("deleted_at", null)
      .order("orden", { ascending: true }),
    supabase
      .from("tareas_comentarios")
      .select("id, tarea_id, cuerpo, autor, autor_socio_id, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("socios")
      .select("id, nombre, email")
      .is("deleted_at", null)
      .order("nombre"),
    supabase
      .from("clientes")
      .select("id, nombre")
      .is("deleted_at", null)
      .order("nombre"),
    supabase
      .from("proyectos")
      .select("id, nombre, clientes(nombre)")
      .is("deleted_at", null)
      .order("nombre"),
  ])

  const tareas = (tareasData ?? []) as Tarea[]
  const comentarios = (comentariosData ?? []) as ComentarioTarea[]
  const socios = (sociosData ?? []) as Socio[]
  const clientes = (clientesData ?? []) as { id: string; nombre: string }[]
  const proyectos: ProyectoOpcion[] = (
    (proyectosData ?? []) as unknown as ProyectoConCliente[]
  ).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    cliente: p.clientes?.nombre ?? "Sin cliente",
  }))

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Tareas</h1>
          <p className="text-muted-foreground">
            Tablero de la empresa. Arrastrá las tarjetas entre columnas o
            editalas para cambiarles el estado.
          </p>
        </div>
        <NuevaTarea socios={socios} clientes={clientes} proyectos={proyectos} />
      </div>

      <Tablero
        tareas={tareas}
        comentarios={comentarios}
        socios={socios}
        clientes={clientes}
        proyectos={proyectos}
      />
    </>
  )
}

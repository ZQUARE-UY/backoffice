import { Encabezado } from "@/components/zq/encabezado"
import { paredEnZona } from "@/lib/disponibilidad"
import { type Cliente, type Decision, type Socio } from "@/lib/dominio"
import { createClient } from "@/lib/supabase/server"

import { type OpcionReunion } from "./campos-decision"
import { NuevaDecision } from "./nueva-decision"
import { VistaDecisiones, type OrigenDecision } from "./vista-decisiones"

export const metadata = { title: "Decisiones" }

export default async function DecisionesPage({
  searchParams,
}: {
  searchParams: Promise<{ decision?: string }>
}) {
  const { decision: decisionAbierta } = await searchParams
  const supabase = await createClient()

  const [{ data: decisionesData }, { data: sociosData }, { data: clientesData }, { data: proyectosData }, { data: reunionesData }] =
    await Promise.all([
      supabase.from("decisiones").select("*").is("deleted_at", null).order("fecha", { ascending: false }),
      supabase.from("socios").select("id, nombre, email").is("deleted_at", null),
      supabase.from("clientes").select("id, nombre").is("deleted_at", null).order("nombre"),
      supabase.from("proyectos").select("id, nombre, cliente_id").is("deleted_at", null),
      supabase
        .from("solicitudes_reunion")
        .select("id, titulo, inicio, drive_transcripcion_url")
        .eq("estado", "agendada")
        .not("inicio", "is", null)
        .is("deleted_at", null)
        .order("inicio", { ascending: false }),
    ])

  const decisiones = (decisionesData ?? []) as Decision[]
  const socios = (sociosData ?? []) as Socio[]
  const clientes = (clientesData ?? []) as Pick<Cliente, "id" | "nombre">[]
  const proyectos = (proyectosData ?? []) as { id: string; nombre: string; cliente_id: string | null }[]

  // Origen de cada decisión: la reunión de la que salió (`reunion_id`), con
  // su transcripción si la hay.
  type Reunion = { id: string; titulo: string; inicio: string; drive_transcripcion_url: string | null }
  const reunionesAgendadas = (reunionesData ?? []) as Reunion[]
  const reunionPorId = new Map(reunionesAgendadas.map((r) => [r.id, r]))
  const origenes: Record<string, OrigenDecision> = {}
  for (const d of decisiones) {
    const r = d.reunion_id ? reunionPorId.get(d.reunion_id) : null
    if (r) origenes[d.id] = { id: r.id, titulo: r.titulo, transcripcion: r.drive_transcripcion_url }
  }
  const reuniones: OpcionReunion[] = reunionesAgendadas.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    dia: paredEnZona(Date.parse(r.inicio)).fecha,
  }))

  return (
    <>
      <Encabezado titulo="Decisiones" acciones={<NuevaDecision socios={socios} clientes={clientes} reuniones={reuniones} escucharCrear />} />
      <VistaDecisiones
        decisiones={decisiones}
        socios={socios}
        clientes={clientes}
        proyectos={proyectos}
        origenes={origenes}
        reuniones={reuniones}
        decisionAbierta={decisionAbierta}
      />
    </>
  )
}

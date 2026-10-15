import { Encabezado } from "@/components/zq/encabezado"
import { paredEnZona } from "@/lib/disponibilidad"
import { type Cliente, type Decision, type Socio } from "@/lib/dominio"
import { createClient } from "@/lib/supabase/server"

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
        .select("id, titulo, inicio, cliente_id, proyecto_id, drive_transcripcion_url")
        .eq("estado", "agendada")
        .not("inicio", "is", null)
        .is("deleted_at", null),
    ])

  const decisiones = (decisionesData ?? []) as Decision[]
  const socios = (sociosData ?? []) as Socio[]
  const clientes = (clientesData ?? []) as Pick<Cliente, "id" | "nombre">[]
  const proyectos = (proyectosData ?? []) as { id: string; nombre: string; cliente_id: string | null }[]

  // Origen de cada decisión: no hay un vínculo guardado con la reunión, así
  // que se busca la reunión de ese mismo día con el mismo proyecto o
  // cliente (y su transcripción, si la hay).
  type Reunion = {
    id: string
    titulo: string
    inicio: string
    cliente_id: string | null
    proyecto_id: string | null
    drive_transcripcion_url: string | null
  }
  const reuniones = ((reunionesData ?? []) as Reunion[]).map((r) => ({ ...r, dia: paredEnZona(Date.parse(r.inicio)).fecha }))
  const origenes: Record<string, OrigenDecision> = {}
  for (const d of decisiones) {
    if (!d.cliente_id && !d.proyecto_id) continue
    const r = reuniones.find(
      (r) =>
        r.dia === d.fecha &&
        ((d.proyecto_id && r.proyecto_id === d.proyecto_id) || (d.cliente_id && r.cliente_id === d.cliente_id))
    )
    if (r) origenes[d.id] = { id: r.id, titulo: r.titulo, transcripcion: r.drive_transcripcion_url }
  }

  return (
    <>
      <Encabezado titulo="Decisiones" acciones={<NuevaDecision socios={socios} clientes={clientes} escucharCrear />} />
      <VistaDecisiones
        decisiones={decisiones}
        socios={socios}
        clientes={clientes}
        proyectos={proyectos}
        origenes={origenes}
        decisionAbierta={decisionAbierta}
      />
    </>
  )
}

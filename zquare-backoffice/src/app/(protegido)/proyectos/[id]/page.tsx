import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon } from "lucide-react"

import { EditarProyecto } from "./editar-proyecto"
import { EstadoProyectoBadge } from "@/components/estado-badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card"
import { type Cliente, type Proyecto } from "@/lib/dominio"
import { createClient } from "@/lib/supabase/server"

function formatearMonto(monto: number | null, moneda: string | null) {
  if (monto == null) return "—"
  return `${moneda ?? ""} ${monto.toLocaleString("es-UY")}`.trim()
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm">{valor}</CardContent>
    </Card>
  )
}

export default async function ProyectoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: proyecto } = await supabase
    .from("proyectos")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<Proyecto>()

  if (!proyecto) notFound()

  const { data: cliente } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", proyecto.cliente_id)
    .maybeSingle<Cliente>()

  return (
    <>
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-2"
          nativeButton={false}
          render={<Link href={`/clientes/${proyecto.cliente_id}`} />}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {cliente?.nombre ?? "Cliente"}
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {proyecto.nombre}
            </h1>
            <EstadoProyectoBadge estado={proyecto.estado} />
          </div>
          <EditarProyecto proyecto={proyecto} />
        </div>
      </div>

      {proyecto.descripcion && (
        <Card>
          <CardHeader>
            <CardDescription>Descripción</CardDescription>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {proyecto.descripcion}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Dato label="Inicio" valor={proyecto.fecha_inicio ?? "—"} />
        <Dato
          label="Fin estimado"
          valor={proyecto.fecha_fin_estimada ?? "—"}
        />
        <Dato label="Fin real" valor={proyecto.fecha_fin_real ?? "—"} />
        <Dato
          label="Horas estimadas"
          valor={proyecto.horas_estimadas?.toString() ?? "—"}
        />
        <Dato
          label="Horas reales"
          valor={proyecto.horas_reales?.toString() ?? "—"}
        />
        <Dato
          label="Monto acordado"
          valor={formatearMonto(proyecto.monto_acordado, proyecto.moneda)}
        />
      </div>
    </>
  )
}

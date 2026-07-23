import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react"

import { BotonEliminar } from "@/components/boton-eliminar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ESTADOS_PRESUPUESTO,
  type Cliente,
  type Presupuesto,
  type PresupuestoItem,
  type Proyecto,
} from "@/lib/dominio"
import { createClient } from "@/lib/supabase/server"

import { eliminarPresupuesto } from "../actions"
import { EditarPresupuesto } from "./editar-presupuesto"
import { ItemsEditor } from "./items-editor"

export default async function PresupuestoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: presupuesto } = await supabase
    .from("presupuestos")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<Presupuesto>()

  if (!presupuesto) notFound()

  const [{ data: cliente }, { data: proyecto }, { data: itemsData }] =
    await Promise.all([
      supabase
        .from("clientes")
        .select("*")
        .eq("id", presupuesto.cliente_id)
        .maybeSingle<Cliente>(),
      presupuesto.proyecto_id
        ? supabase
            .from("proyectos")
            .select("*")
            .eq("id", presupuesto.proyecto_id)
            .maybeSingle<Proyecto>()
        : Promise.resolve({ data: null }),
      supabase
        .from("presupuesto_items")
        .select("*")
        .eq("presupuesto_id", id)
        .order("orden", { ascending: true }),
    ])

  const items = (itemsData ?? []) as PresupuestoItem[]
  const estadoInfo = ESTADOS_PRESUPUESTO[presupuesto.estado]

  return (
    <>
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-2"
          nativeButton={false}
          render={<Link href={`/clientes/${presupuesto.cliente_id}`} />}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          {cliente?.nombre ?? "Cliente"}
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              Presupuesto v{presupuesto.version}
            </h1>
            <Badge variant={estadoInfo.variant}>{estadoInfo.label}</Badge>
          </div>
          <div className="flex gap-2">
            <EditarPresupuesto presupuesto={presupuesto} />
            <BotonEliminar
              accion={eliminarPresupuesto.bind(
                null,
                presupuesto.id,
                presupuesto.cliente_id
              )}
              titulo={`¿Eliminar el presupuesto v${presupuesto.version}?`}
              descripcion="Se ocultará el presupuesto y sus ítems. Podés recuperarlo desde la base si hace falta."
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Moneda</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">{presupuesto.moneda}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Enviado</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {presupuesto.fecha_envio ?? "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Proyecto</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {proyecto ? (
              <Link
                href={`/proyectos/${proyecto.id}`}
                className="hover:underline"
              >
                {proyecto.nombre}
              </Link>
            ) : (
              "—"
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Documento</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {presupuesto.drive_url ? (
              <a
                href={presupuesto.drive_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Abrir <ExternalLinkIcon className="size-3.5" />
              </a>
            ) : (
              "—"
            )}
          </CardContent>
        </Card>
      </div>

      {presupuesto.notas && (
        <Card>
          <CardHeader>
            <CardDescription>Notas</CardDescription>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {presupuesto.notas}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ítems</CardTitle>
          <CardDescription>
            Cargá cada línea con sus horas y tarifa. El subtotal es horas ×
            tarifa; si dejás horas en blanco, la tarifa es el precio del ítem.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ItemsEditor
            presupuestoId={presupuesto.id}
            itemsIniciales={items}
            moneda={presupuesto.moneda}
          />
        </CardContent>
      </Card>
    </>
  )
}

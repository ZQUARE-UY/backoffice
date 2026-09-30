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
import { MarkdownIdea } from "@/app/(protegido)/ideas/markdown-idea"
import {
  ESTADOS_PRESUPUESTO,
  formatearMonto,
  nombrePresupuesto,
  TIPOS_PROYECTO,
  type Cliente,
  type Presupuesto,
  type PresupuestoItem,
  type Proyecto,
} from "@/lib/dominio"
import {
  codigoPresupuesto,
  horasEstimadas,
  tarifaImplicita,
  tarifaReferencia,
} from "@/lib/presupuestos"
import { createClient } from "@/lib/supabase/server"

import { eliminarPresupuesto } from "../actions"
import { EditarPresupuesto } from "./editar-presupuesto"
import { GenerarDocumento } from "./generar-documento"
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

  const [
    { data: cliente },
    { data: proyecto },
    { data: itemsData },
    { data: anterior },
    tarifaRef,
  ] = await Promise.all([
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
      presupuesto.version_de
        ? supabase
            .from("presupuestos")
            .select("id, titulo, version")
            .eq("id", presupuesto.version_de)
            .maybeSingle<Pick<Presupuesto, "id" | "titulo" | "version">>()
        : Promise.resolve({ data: null }),
      tarifaReferencia(supabase),
    ])

  const items = (itemsData ?? []) as PresupuestoItem[]
  const estadoInfo = ESTADOS_PRESUPUESTO[presupuesto.estado]
  const horas = horasEstimadas(items)
  const porHora = tarifaImplicita(presupuesto.total, horas)
  const nombre = nombrePresupuesto(presupuesto)

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
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-balance">
                {nombre}
              </h1>
              <Badge variant={estadoInfo.variant}>{estadoInfo.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{codigoPresupuesto(presupuesto.numero)}</span>
              {anterior && (
                <>
                  {" · nueva versión de "}
                  <Link href={`/presupuestos/${anterior.id}`} className="hover:underline">
                    {nombrePresupuesto(anterior)}
                  </Link>
                </>
              )}
              {(presupuesto.etiquetas ?? []).length > 0 && ` · ${presupuesto.etiquetas.join(", ")}`}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {/* Un enviado con documento queda congelado: los cambios van en
                la versión siguiente (ver lib/documento-presupuesto). */}
            {(presupuesto.estado === "borrador" || !presupuesto.metadata?.drive_file_id) && (
              <GenerarDocumento
                presupuestoId={presupuesto.id}
                yaGenerado={Boolean(presupuesto.metadata?.drive_file_id)}
              />
            )}
            <EditarPresupuesto presupuesto={presupuesto} />
            <BotonEliminar
              accion={eliminarPresupuesto.bind(
                null,
                presupuesto.id,
                presupuesto.cliente_id
              )}
              titulo={`¿Eliminar ${nombre}?`}
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
          <CardContent className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
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
            {presupuesto.metadata?.pdf_url && (
              <a
                href={presupuesto.metadata.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
                title="Lo que se le envió al cliente"
              >
                PDF enviado <ExternalLinkIcon className="size-3.5" />
              </a>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Tipo de trabajo</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {presupuesto.tipo ? TIPOS_PROYECTO[presupuesto.tipo].label : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Plazo estimado</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {presupuesto.plazo_estimado_semanas
              ? `${presupuesto.plazo_estimado_semanas.toLocaleString("es-UY")} semanas`
              : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Horas estimadas</CardDescription>
          </CardHeader>
          <CardContent className="text-sm tabular-nums">
            {horas > 0 ? `${horas.toLocaleString("es-UY")} h` : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Tarifa implícita</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-0.5 text-sm tabular-nums">
            <span>{porHora != null ? `${formatearMonto(porHora, presupuesto.moneda)} / h` : "—"}</span>
            {tarifaRef != null && presupuesto.moneda === "USD" && (
              <span className="text-xs text-muted-foreground">
                referencia USD {tarifaRef.toLocaleString("es-UY")} / h
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      {(presupuesto.fecha_respuesta || presupuesto.motivo_resultado) && (
        <Card>
          <CardHeader>
            <CardDescription>
              Respuesta del cliente
              {presupuesto.fecha_respuesta && ` · ${presupuesto.fecha_respuesta}`}
            </CardDescription>
          </CardHeader>
          {presupuesto.motivo_resultado && (
            <CardContent className="text-sm whitespace-pre-wrap">
              {presupuesto.motivo_resultado}
            </CardContent>
          )}
        </Card>
      )}

      {presupuesto.contenido && (
        <Card>
          <CardHeader>
            <CardTitle>Propuesta</CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownIdea>{presupuesto.contenido}</MarkdownIdea>
          </CardContent>
        </Card>
      )}

      {presupuesto.notas && (
        <Card>
          <CardHeader>
            <CardDescription>Notas internas</CardDescription>
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
            Las horas internas son lo que estimamos que lleva, aunque se cobre
            a precio cerrado: con ellas se calcula la tarifa implícita.
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

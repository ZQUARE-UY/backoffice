import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FilesIcon,
  FolderIcon,
} from "lucide-react"

import {
  EstadoClienteBadge,
  EstadoPresupuestoBadge,
  EstadoProyectoBadge,
} from "@/components/estado-badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  formatearMonto,
  TIPOS_DOCUMENTO,
  type Cliente,
  type Documento,
  type Presupuesto,
  type Proyecto,
} from "@/lib/dominio"
import { createClient } from "@/lib/supabase/server"

import { Badge } from "@/components/ui/badge"
import { BotonEliminar } from "@/components/boton-eliminar"
import { Skeleton } from "@/components/ui/skeleton"

import { eliminarCliente } from "../actions"
import { ArchivosDrive, BotonAbrirCarpeta } from "./archivos-drive"
import { DocumentoAcciones } from "./documento-acciones"
import { EditarCliente } from "./editar-cliente"
import { NuevoDocumento } from "./nuevo-documento"
import { NuevoPresupuesto } from "./nuevo-presupuesto"
import { NuevoProyecto } from "./nuevo-proyecto"

export default async function ClientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: cliente } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<Cliente>()

  if (!cliente) notFound()

  const [
    { data: proyectosData },
    { data: presupuestosData },
    { data: documentosData },
  ] = await Promise.all([
      supabase
        .from("proyectos")
        .select("*")
        .eq("cliente_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("presupuestos")
        .select("*")
        .eq("cliente_id", id)
        .is("deleted_at", null)
        .order("version", { ascending: false }),
      supabase
        .from("documentos")
        .select("*")
        .eq("cliente_id", id)
        .is("deleted_at", null)
        .order("fecha", { ascending: false }),
    ])

  const proyectos = (proyectosData ?? []) as Proyecto[]
  const presupuestos = (presupuestosData ?? []) as Presupuesto[]
  const documentos = (documentosData ?? []) as Documento[]
  const proyectosMini = proyectos.map((p) => ({ id: p.id, nombre: p.nombre }))

  return (
    <>
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-2"
          nativeButton={false}
          render={<Link href="/clientes" />}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Clientes
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {cliente.nombre}
              </h1>
              <EstadoClienteBadge estado={cliente.estado} />
            </div>
            {cliente.empresa && (
              <p className="text-muted-foreground">{cliente.empresa}</p>
            )}
          </div>
          <div className="flex gap-2">
            <EditarCliente cliente={cliente} />
            <BotonEliminar
              accion={eliminarCliente.bind(null, cliente.id)}
              titulo={`¿Eliminar a ${cliente.nombre}?`}
              descripcion="Se ocultará el cliente junto con todos sus proyectos. Podés recuperarlo desde la base si hace falta."
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Contacto</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <span>{cliente.email ?? "Sin email"}</span>
            <span className="text-muted-foreground">
              {cliente.telefono ?? "Sin teléfono"}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Origen</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {cliente.origen ?? "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Notas</CardDescription>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {cliente.notas ?? "—"}
          </CardContent>
        </Card>
      </div>

      {cliente.drive_folder_id && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">
              Carpeta en Drive
            </h2>
            <BotonAbrirCarpeta carpetaId={cliente.drive_folder_id} />
          </div>
          <Suspense fallback={<Skeleton className="h-24 w-full rounded-lg" />}>
            <ArchivosDrive carpetaId={cliente.drive_folder_id} />
          </Suspense>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Proyectos</h2>
        <NuevoProyecto clienteId={cliente.id} />
      </div>

      {proyectos.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderIcon />
            </EmptyMedia>
            <EmptyTitle>Sin proyectos</EmptyTitle>
            <EmptyDescription>
              Este cliente todavía no tiene proyectos cargados.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Fin estimado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proyectos.map((proyecto) => (
                <TableRow key={proyecto.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/proyectos/${proyecto.id}`}
                      className="hover:underline"
                    >
                      {proyecto.nombre}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <EstadoProyectoBadge estado={proyecto.estado} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatearMonto(proyecto.monto_acordado, proyecto.moneda)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {proyecto.fecha_fin_estimada ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Presupuestos</h2>
        <NuevoPresupuesto clienteId={cliente.id} proyectos={proyectosMini} />
      </div>

      {presupuestos.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>Sin presupuestos</EmptyTitle>
            <EmptyDescription>
              Este cliente todavía no tiene presupuestos cargados.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Versión</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Enviado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {presupuestos.map((presupuesto) => (
                <TableRow key={presupuesto.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/presupuestos/${presupuesto.id}`}
                      className="hover:underline"
                    >
                      Presupuesto v{presupuesto.version}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <EstadoPresupuestoBadge estado={presupuesto.estado} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatearMonto(presupuesto.total, presupuesto.moneda)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {presupuesto.fecha_envio ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Documentos</h2>
        <NuevoDocumento clienteId={cliente.id} proyectos={proyectosMini} />
      </div>

      {documentos.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FilesIcon />
            </EmptyMedia>
            <EmptyTitle>Sin documentos</EmptyTitle>
            <EmptyDescription>
              Agregá análisis, propuestas, contratos o minutas con su link a
              Drive.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {documentos.map((documento) => (
                <TableRow key={documento.id}>
                  <TableCell className="font-medium">
                    <a
                      href={documento.drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      {documento.titulo}
                      <ExternalLinkIcon className="size-3.5 text-muted-foreground" />
                    </a>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {TIPOS_DOCUMENTO[documento.tipo].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {documento.fecha}
                  </TableCell>
                  <TableCell>
                    <DocumentoAcciones
                      documento={documento}
                      proyectos={proyectosMini}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}

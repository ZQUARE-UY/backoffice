import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, FolderIcon } from "lucide-react"

import { EstadoClienteBadge, EstadoProyectoBadge } from "@/components/estado-badge"
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
import { type Cliente, type Proyecto } from "@/lib/dominio"
import { createClient } from "@/lib/supabase/server"

import { BotonEliminar } from "@/components/boton-eliminar"

import { eliminarCliente } from "../actions"
import { EditarCliente } from "./editar-cliente"
import { NuevoProyecto } from "./nuevo-proyecto"

function formatearMonto(monto: number | null, moneda: string | null) {
  if (monto == null) return "—"
  return `${moneda ?? ""} ${monto.toLocaleString("es-UY")}`.trim()
}

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

  const { data: proyectosData } = await supabase
    .from("proyectos")
    .select("*")
    .eq("cliente_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  const proyectos = (proyectosData ?? []) as Proyecto[]

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
    </>
  )
}

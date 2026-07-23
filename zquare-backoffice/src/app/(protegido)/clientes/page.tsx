import Link from "next/link"
import { UsersIcon } from "lucide-react"

import { EstadoClienteBadge } from "@/components/estado-badge"
import {
  Empty,
  EmptyContent,
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
import { type Cliente } from "@/lib/dominio"
import { createClient } from "@/lib/supabase/server"

import { NuevoCliente } from "./nuevo-cliente"

export const metadata = { title: "Clientes" }

export default async function ClientesPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("clientes")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  const clientes = (data ?? []) as Cliente[]

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">
            {clientes.length === 0
              ? "Todavía no hay clientes cargados."
              : `${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"}.`}
          </p>
        </div>
        <NuevoCliente />
      </div>

      {clientes.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>Sin clientes</EmptyTitle>
            <EmptyDescription>
              Creá el primer cliente para empezar a cargar proyectos y
              documentos.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <NuevoCliente />
          </EmptyContent>
        </Empty>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Contacto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.map((cliente) => (
                <TableRow key={cliente.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/clientes/${cliente.id}`}
                      className="hover:underline"
                    >
                      {cliente.nombre}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cliente.empresa ?? "—"}
                  </TableCell>
                  <TableCell>
                    <EstadoClienteBadge estado={cliente.estado} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cliente.email ?? cliente.telefono ?? "—"}
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

import Link from "next/link"
import { ExternalLinkIcon, FilesIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
import { TIPOS_DOCUMENTO, type Documento } from "@/lib/dominio"
import { createClient } from "@/lib/supabase/server"
import { estadoIndice } from "./indice-actions"
import { IndiceBusqueda } from "./indice-busqueda"

export const metadata = { title: "Documentos" }

// La indexación semántica procesa lotes de archivos de Drive: le damos el
// máximo de tiempo permitido en Vercel Hobby.
export const maxDuration = 60

type FilaCliente = { nombre: string } | { nombre: string }[] | null

function nombreCliente(rel: FilaCliente): string | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0]?.nombre ?? null) : rel.nombre
}

export default async function DocumentosPage() {
  const supabase = await createClient()
  const [{ data }, indice] = await Promise.all([
    supabase
      .from("documentos")
      .select("*, clientes(nombre)")
      .is("deleted_at", null)
      .order("fecha", { ascending: false }),
    estadoIndice(),
  ])

  const documentos = (data ?? []) as (Documento & { clientes: FilaCliente })[]

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
        <p className="text-muted-foreground">
          {documentos.length === 0
            ? "Todavía no hay documentos cargados."
            : `${documentos.length} ${
                documentos.length === 1 ? "documento" : "documentos"
              } en total.`}
        </p>
      </div>

      {documentos.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FilesIcon />
            </EmptyMedia>
            <EmptyTitle>Sin documentos</EmptyTitle>
            <EmptyDescription>
              Los documentos se agregan desde la ficha de cada cliente. Acá los
              ves todos juntos.
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
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
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
                  <TableCell>
                    <Link
                      href={`/clientes/${documento.cliente_id}`}
                      className="text-muted-foreground hover:underline"
                    >
                      {nombreCliente(documento.clientes) ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {documento.fecha}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <IndiceBusqueda estado={indice} />
    </>
  )
}

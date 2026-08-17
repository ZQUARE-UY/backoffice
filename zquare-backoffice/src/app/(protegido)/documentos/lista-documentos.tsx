"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ExternalLinkIcon, TagIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SelectCampo } from "@/components/select-campo"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TIPOS_DOCUMENTO, type TipoDocumento } from "@/lib/dominio"

import { AnotarArchivo } from "./anotar-archivo"

export type FilaDocumento = {
  fileId: string
  nombre: string
  nombreArchivo: string
  url: string
  ruta: string[]
  modificado: string
  anotacion: {
    id: string
    tipo: TipoDocumento
    tags: string[]
    fecha: string
  } | null
  cliente: { id: string; nombre: string } | null
  proyecto: { id: string; nombre: string } | null
}

export type OpcionCliente = { id: string; nombre: string }
export type OpcionProyecto = { id: string; nombre: string; cliente_id: string | null }

// El filtrado es en el cliente a propósito: los archivos ya vinieron todos
// (recorrer Drive es la parte cara y se hace una vez), así que filtrar sin
// volver al servidor es instantáneo y no cuesta nada.
export function ListaDocumentos({
  filas,
  clientes,
  proyectos,
  huerfanas,
}: {
  filas: FilaDocumento[]
  clientes: OpcionCliente[]
  proyectos: OpcionProyecto[]
  huerfanas: { id: string; titulo: string; drive_url: string }[]
}) {
  const [texto, setTexto] = useState("")
  const [cliente, setCliente] = useState("")
  const [tipo, setTipo] = useState("")
  const [soloSinFicha, setSoloSinFicha] = useState(false)

  const visibles = useMemo(() => {
    const busqueda = texto.trim().toLowerCase()
    return filas.filter((fila) => {
      if (cliente && fila.cliente?.id !== cliente) return false
      if (tipo && fila.anotacion?.tipo !== tipo) return false
      if (soloSinFicha && fila.anotacion) return false
      if (!busqueda) return true
      return (
        fila.nombre.toLowerCase().includes(busqueda) ||
        fila.ruta.join("/").toLowerCase().includes(busqueda) ||
        (fila.anotacion?.tags ?? []).some((t) =>
          t.toLowerCase().includes(busqueda)
        )
      )
    })
  }, [filas, texto, cliente, tipo, soloSinFicha])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por nombre, carpeta o tag…"
          className="max-w-xs"
        />
        <SelectCampo
          name="cliente"
          value={cliente}
          onValueChange={setCliente}
          triggerClassName="w-44"
          opciones={[
            { valor: "", label: "Todos los clientes" },
            ...clientes.map((c) => ({ valor: c.id, label: c.nombre })),
          ]}
        />
        <SelectCampo
          name="tipo"
          value={tipo}
          onValueChange={setTipo}
          triggerClassName="w-40"
          opciones={[
            { valor: "", label: "Todos los tipos" },
            ...Object.entries(TIPOS_DOCUMENTO).map(([valor, { label }]) => ({
              valor,
              label,
            })),
          ]}
        />
        <Button
          variant={soloSinFicha ? "default" : "outline"}
          size="sm"
          onClick={() => setSoloSinFicha((v) => !v)}
        >
          Sin ficha
        </Button>
        <span className="text-sm text-muted-foreground">
          {visibles.length} de {filas.length}
        </span>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Archivo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Carpeta</TableHead>
              <TableHead>Modificado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.map((fila) => (
              <TableRow key={fila.fileId}>
                <TableCell className="font-medium">
                  <a
                    href={fila.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    {fila.nombre}
                    <ExternalLinkIcon className="size-3.5 text-muted-foreground" />
                  </a>
                  {fila.anotacion && fila.anotacion.tags.length > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <TagIcon className="size-3" />
                      {fila.anotacion.tags.join(", ")}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {fila.anotacion ? (
                    <Badge variant="secondary">
                      {TIPOS_DOCUMENTO[fila.anotacion.tipo].label}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Sin ficha
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {fila.cliente ? (
                    <Link
                      href={`/clientes/${fila.cliente.id}`}
                      className="hover:underline"
                    >
                      {fila.cliente.nombre}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell
                  className="max-w-[16rem] truncate text-xs text-muted-foreground"
                  title={fila.ruta.join(" / ")}
                >
                  {fila.ruta.at(-1) ?? "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {fila.modificado.slice(0, 10)}
                </TableCell>
                <TableCell className="text-right">
                  <AnotarArchivo
                    fila={fila}
                    clientes={clientes}
                    proyectos={proyectos}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {huerfanas.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <p className="text-sm font-medium">
            {huerfanas.length} ficha{huerfanas.length === 1 ? "" : "s"} sin
            archivo en Drive
          </p>
          <p className="text-xs text-muted-foreground">
            El archivo se movió, se borró o el link no permite deducir su id.
            Quedan acá para no perder lo que tenían anotado.
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {huerfanas.map((h) => (
              <li key={h.id}>
                <a
                  href={h.drive_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {h.titulo}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

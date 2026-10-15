"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowUpRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverCancelar, PopoverRotulo, PopoverTitulo } from "@/components/zq/popover"
import { EtiquetaArchivo, tipoArchivo } from "@/components/zq/tipo-archivo"
import { TIPOS_DOCUMENTO, type TipoDocumento } from "@/lib/dominio"
import { fechaCorta } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { AnotarArchivo } from "./anotar-archivo"
import { vistaPrevia } from "./indice-actions"

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
  // Con qué se relaciona: la reunión de la que es transcripción y las
  // decisiones de ese día.
  vinculos: {
    reunion: { id: string; titulo: string } | null
    decisiones: { id: string; titulo: string }[]
  }
}

export type OpcionCliente = { id: string; nombre: string }
export type OpcionProyecto = { id: string; nombre: string; cliente_id: string | null }

const SIN_CLIENTE = "interno"

// Carpetas por cliente (tarjetas seleccionables) y la lista de archivos de
// la carpeta elegida. Los archivos ya vinieron todos del server (recorrer
// Drive es lo caro), así que cambiar de carpeta es instantáneo.
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
  // Una carpeta por cliente, más "Interno" para lo que no es de nadie.
  // Ordenadas por el archivo más nuevo.
  const carpetas = Array.from(
    filas.reduce((m, f) => {
      const id = f.cliente?.id ?? SIN_CLIENTE
      const c = m.get(id) ?? { id, nombre: f.cliente?.nombre ?? "Interno", n: 0, ultimo: "" }
      c.n++
      if (f.modificado > c.ultimo) c.ultimo = f.modificado
      return m.set(id, c)
    }, new Map<string, { id: string; nombre: string; n: number; ultimo: string }>())
  ).map(([, c]) => c)
  carpetas.sort((a, b) => b.ultimo.localeCompare(a.ultimo))

  const [carpeta, setCarpeta] = useState(carpetas[0]?.id ?? SIN_CLIENTE)
  const [abierto, setAbierto] = useState<FilaDocumento | null>(null)
  const delaCarpeta = filas.filter((f) => (f.cliente?.id ?? SIN_CLIENTE) === carpeta)

  return (
    <div className="flex flex-col gap-5">
      <div
        role="group"
        aria-label="Carpetas por cliente"
        className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 max-escritorio:-mx-4 max-escritorio:flex max-escritorio:overflow-x-auto max-escritorio:px-4 max-escritorio:pb-1"
      >
        {carpetas.map((c) => {
          const on = c.id === carpeta
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => setCarpeta(c.id)}
              className={cn(
                "flex shrink-0 flex-col items-start gap-1 rounded-xl border px-4 py-3.5 text-left max-escritorio:min-w-[160px]",
                on ? "border-foreground bg-card ring-1 ring-foreground" : "bg-card hover:border-input"
              )}
            >
              <span className="font-semibold">{c.nombre}</span>
              <span className="zq-num text-xs text-muted-foreground">
                {c.n} {c.n === 1 ? "archivo" : "archivos"} · {fechaCorta(c.ultimo)}
              </span>
            </button>
          )
        })}
      </div>

      <section aria-label="Archivos" className="rounded-xl border bg-card px-[18px] py-1.5">
        {delaCarpeta.length === 0 ? (
          <p className="m-0 py-6 text-center text-muted-foreground">Esta carpeta está vacía.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {delaCarpeta.map((f) => (
              <li key={f.fileId} className="border-t first:border-t-0">
                <button
                  type="button"
                  onClick={() => setAbierto(f)}
                  className="flex w-full items-center gap-3 py-3 text-left hover:bg-muted/50"
                >
                  <EtiquetaArchivo nombre={f.nombreArchivo} />
                  <span className="min-w-0 flex-1 truncate">{f.nombre}</span>
                  <span className="hidden w-40 shrink-0 truncate text-xs text-muted-foreground sm:block" title={f.ruta.join(" / ")}>
                    {f.ruta.at(-1) ?? "—"}
                  </span>
                  <span className="zq-num w-14 shrink-0 text-right text-xs text-muted-foreground">{fechaCorta(f.modificado)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {huerfanas.length > 0 && (
        <details className="rounded-xl border border-dashed border-input px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold select-none">
            {huerfanas.length} {huerfanas.length === 1 ? "ficha" : "fichas"} sin archivo en Drive
          </summary>
          <p className="mt-2 mb-2 text-xs text-muted-foreground">
            El archivo se movió, se borró o el link no permite deducir su id. Quedan acá para no perder lo anotado.
          </p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            {huerfanas.map((h) => (
              <li key={h.id}>
                <a href={h.drive_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {h.titulo}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}

      {abierto && (
        <FichaDocumento
          key={abierto.fileId}
          fila={abierto}
          clientes={clientes}
          proyectos={proyectos}
          onCerrar={() => setAbierto(null)}
        />
      )}
    </div>
  )
}

// Ficha de documento (Popover): a la izquierda la vista previa en una hoja
// blanca; a la derecha qué es, de dónde y con qué está vinculado.
function FichaDocumento({
  fila,
  clientes,
  proyectos,
  onCerrar,
}: {
  fila: FilaDocumento
  clientes: OpcionCliente[]
  proyectos: OpcionProyecto[]
  onCerrar: () => void
}) {
  // undefined = cargando; null = no está indexado.
  const [texto, setTexto] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelado = false
    vistaPrevia(fila.fileId)
      .then((t) => !cancelado && setTexto(t))
      .catch(() => !cancelado && setTexto(null))
    return () => {
      cancelado = true
    }
  }, [fila.fileId])

  const { tipo } = tipoArchivo(fila.nombreArchivo)
  const { reunion, decisiones } = fila.vinculos
  const hayVinculos = Boolean(reunion || decisiones.length || fila.proyecto || fila.cliente)

  return (
    <Popover
      open
      onOpenChange={(v) => !v && onCerrar()}
      aria-label={fila.nombre}
      datos={
        <>
          <EtiquetaArchivo nombre={fila.nombreArchivo} className="h-7 w-12 text-xs" />
          <PopoverTitulo className="text-lg leading-6 font-semibold">{fila.nombre}</PopoverTitulo>
          <div className="flex flex-col gap-1 text-[13px]">
            <span>
              <PopoverRotulo>Carpeta</PopoverRotulo>
              <span className="block">{fila.ruta.join(" / ") || "—"}</span>
            </span>
            <span>
              <PopoverRotulo>Modificado</PopoverRotulo>
              <span className="block">{fechaCorta(fila.modificado)}</span>
            </span>
            <span>
              <PopoverRotulo>Tipo</PopoverRotulo>
              <span className="block">
                {fila.anotacion ? TIPOS_DOCUMENTO[fila.anotacion.tipo].label : tipo}
                {fila.anotacion?.tags.length ? ` · ${fila.anotacion.tags.join(", ")}` : ""}
              </span>
            </span>
          </div>
          {hayVinculos && (
            <div className="flex flex-col gap-1.5 border-t pt-3 text-[13px]">
              <span className="zq-rotulo">Vinculado</span>
              {decisiones.map((d) => (
                <Link key={d.id} href={`/decisiones?decision=${d.id}`} className="hover:underline">
                  Decisión · {d.titulo}
                </Link>
              ))}
              {reunion && (
                <Link href={`/reuniones/${reunion.id}`} className="hover:underline">
                  Reunión · {reunion.titulo}
                </Link>
              )}
              {fila.proyecto && (
                <Link href={`/proyectos/${fila.proyecto.id}`} className="hover:underline">
                  Proyecto · {fila.proyecto.nombre}
                </Link>
              )}
              {fila.cliente && (
                <Link href={`/clientes/${fila.cliente.id}`} className="hover:underline">
                  Cliente · {fila.cliente.nombre}
                </Link>
              )}
            </div>
          )}
          <div className="[&_button]:h-8 [&_button]:px-0">
            <AnotarArchivo fila={fila} clientes={clientes} proyectos={proyectos} />
          </div>
        </>
      }
      acciones={
        <>
          <PopoverCancelar>Cerrar</PopoverCancelar>
          <Button nativeButton={false} render={<a href={fila.url} target="_blank" rel="noopener noreferrer" />}>
            Abrir en Drive
            <ArrowUpRightIcon data-icon="inline-end" />
          </Button>
        </>
      }
    >
      {/* La hoja blanca es una de las dos excepciones a no hardcodear
          colores: el documento se ve igual en los dos temas. */}
      <div className="min-h-[420px] rounded-md bg-white px-9 py-8 text-[13px] leading-[1.6] text-[#1e272c] shadow-[0_2px_10px_rgba(30,39,44,0.12)]">
        {texto === undefined ? (
          <p className="m-0 text-[#6b7175]">Cargando la vista previa…</p>
        ) : texto === null ? (
          <p className="m-0 text-[#6b7175]">
            Sin vista previa: el archivo todavía no está en el índice. Abrilo en Drive o actualizá el índice.
          </p>
        ) : (
          <p className="m-0 line-clamp-[22] whitespace-pre-line">{texto}</p>
        )}
      </div>
    </Popover>
  )
}

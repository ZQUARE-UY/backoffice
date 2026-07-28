"use client"

import { useState, useTransition } from "react"
import { ChevronRightIcon, FolderIcon } from "lucide-react"
import { toast } from "sonner"

import { Spinner } from "@/components/ui/spinner"
import type { ArchivoDrive } from "@/lib/drive"
import { listarCarpetaDrive } from "./archivos-drive-actions"

type Nivel = { id: string; nombre: string }

// Navegador de la carpeta de Drive del cliente: las carpetas se recorren acá
// adentro (con breadcrumbs); los archivos abren en Drive en otra pestaña.
export function NavegadorDrive({
  carpetaId,
  inicial,
}: {
  carpetaId: string
  inicial: ArchivoDrive[]
}) {
  const [ruta, setRuta] = useState<Nivel[]>([{ id: carpetaId, nombre: "Drive" }])
  const [archivos, setArchivos] = useState(inicial)
  const [cargando, iniciarTransicion] = useTransition()

  function cargar(nuevaRuta: Nivel[]) {
    iniciarTransicion(async () => {
      try {
        const items = await listarCarpetaDrive(nuevaRuta[nuevaRuta.length - 1].id)
        setRuta(nuevaRuta)
        setArchivos(items)
      } catch {
        toast.error("No se pudo cargar la carpeta de Drive.")
      }
    })
  }

  const entrar = (a: ArchivoDrive) =>
    cargar([...ruta, { id: a.id, nombre: a.nombre }])
  const irA = (indice: number) => cargar(ruta.slice(0, indice + 1))

  return (
    <div className="flex flex-col gap-2">
      {ruta.length > 1 && (
        <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          {ruta.map((nivel, i) => (
            <span key={nivel.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRightIcon className="size-3.5" />}
              {i === ruta.length - 1 ? (
                <span className="font-medium text-foreground">
                  {nivel.nombre}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => irA(i)}
                  className="hover:text-foreground hover:underline"
                >
                  {nivel.nombre}
                </button>
              )}
            </span>
          ))}
        </nav>
      )}

      <div
        className={`flex flex-col divide-y rounded-lg border ${cargando ? "opacity-50" : ""}`}
      >
        {cargando && archivos.length === 0 && (
          <div className="flex items-center justify-center py-6">
            <Spinner />
          </div>
        )}
        {archivos.length === 0 && !cargando && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Carpeta vacía.
          </p>
        )}
        {archivos.map((a) =>
          a.esCarpeta ? (
            <button
              key={a.id}
              type="button"
              onClick={() => entrar(a)}
              disabled={cargando}
              className="flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{a.nombre}</span>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </button>
          ) : (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted"
            >
              {a.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.iconUrl} alt="" className="size-4 shrink-0" />
              ) : (
                <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1 truncate">{a.nombre}</span>
            </a>
          )
        )}
      </div>
    </div>
  )
}

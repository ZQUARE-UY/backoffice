import { ExternalLinkIcon, FolderIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { listarArchivos, urlCarpeta } from "@/lib/drive"

// Server component: lista en vivo los archivos de la carpeta de Drive.
export async function ArchivosDrive({ carpetaId }: { carpetaId: string }) {
  let archivos
  try {
    archivos = await listarArchivos(carpetaId)
  } catch {
    return (
      <p className="text-sm text-muted-foreground">
        No se pudieron cargar los archivos de Drive.
      </p>
    )
  }

  if (archivos.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderIcon />
          </EmptyMedia>
          <EmptyTitle>Carpeta vacía</EmptyTitle>
          <EmptyDescription>
            Todavía no hay archivos en la carpeta de Drive de este cliente.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col divide-y rounded-lg border">
      {archivos.map((a) => (
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
          {a.esCarpeta && (
            <span className="text-xs text-muted-foreground">carpeta</span>
          )}
        </a>
      ))}
    </div>
  )
}

export function BotonAbrirCarpeta({ carpetaId }: { carpetaId: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={
        <a href={urlCarpeta(carpetaId)} target="_blank" rel="noopener noreferrer" />
      }
    >
      Abrir en Drive
      <ExternalLinkIcon data-icon="inline-end" />
    </Button>
  )
}

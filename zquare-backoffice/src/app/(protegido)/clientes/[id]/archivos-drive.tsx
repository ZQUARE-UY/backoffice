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
import { NavegadorDrive } from "./navegador-drive"

// Server component: trae el primer nivel de la carpeta de Drive y delega la
// navegación (carpetas adentro del backoffice, archivos abren en Drive) al
// navegador client-side.
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

  return <NavegadorDrive carpetaId={carpetaId} inicial={archivos} />
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

"use server"

import { listarArchivos, type ArchivoDrive } from "@/lib/drive"

// Listado en vivo de una carpeta de Drive, para navegar desde la ficha sin
// salir del backoffice.
export async function listarCarpetaDrive(
  carpetaId: string
): Promise<ArchivoDrive[]> {
  return listarArchivos(carpetaId)
}

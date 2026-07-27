import "server-only"

import mammoth from "mammoth"
import { extractText, getDocumentProxy } from "unpdf"

import {
  descargarArchivoDrive,
  exportarTextoDrive,
  type ArchivoDriveIndexable,
} from "@/lib/drive"

// Extracción de texto de los archivos de Drive para el índice de búsqueda.
// Tipos soportados: Google Docs/Sheets/Slides (export nativo), docx (mammoth),
// pdf (unpdf) y texto plano. El resto (xlsx binario, imágenes, videos...) se
// saltea — se puede ampliar cuando haga falta.

const MAX_BYTES = 10 * 1024 * 1024 // no descargamos archivos de más de 10 MB

const EXPORTS_GOOGLE: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.presentation": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

export function esIndexable(archivo: ArchivoDriveIndexable): boolean {
  if (archivo.mimeType in EXPORTS_GOOGLE) return true
  if (archivo.tamano > MAX_BYTES) return false
  return (
    archivo.mimeType === DOCX_MIME ||
    archivo.mimeType === "application/pdf" ||
    archivo.mimeType.startsWith("text/")
  )
}

// Devuelve el texto plano del archivo, o null si no se pudo extraer.
export async function extraerTexto(
  archivo: ArchivoDriveIndexable
): Promise<string | null> {
  const mimeExport = EXPORTS_GOOGLE[archivo.mimeType]
  if (mimeExport) {
    return exportarTextoDrive(archivo.id, mimeExport)
  }

  const buffer = await descargarArchivoDrive(archivo.id)

  if (archivo.mimeType === DOCX_MIME) {
    const { value } = await mammoth.extractRawText({ buffer })
    return value
  }

  if (archivo.mimeType === "application/pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: true })
    return text
  }

  if (archivo.mimeType.startsWith("text/")) {
    return buffer.toString("utf8")
  }

  return null
}

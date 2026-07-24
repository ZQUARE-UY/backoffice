"use server"

import { iniciarSubidaResumable, resolverCarpetaDestino } from "@/lib/drive"
import { idSocioActual } from "@/lib/socio-actual"

// Inicia una sesión de subida a Drive y devuelve su URL para que el navegador
// suba los bytes directo a Google. Como usa la cuenta de servicio (saltea RLS),
// se valida explícitamente que quien llama sea un socio.
export async function iniciarSubida(
  carpetaPadreId: string,
  subcarpeta: string | null,
  nombre: string,
  mimeType: string
): Promise<{ url: string }> {
  if (!(await idSocioActual())) throw new Error("No autorizado")

  const nombreLimpio = nombre.trim()
  if (!nombreLimpio) throw new Error("El archivo no tiene nombre")

  const destino = await resolverCarpetaDestino(carpetaPadreId, subcarpeta)
  const url = await iniciarSubidaResumable(
    nombreLimpio,
    destino,
    mimeType || "application/octet-stream"
  )
  return { url }
}

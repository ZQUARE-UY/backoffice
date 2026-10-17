"use client"

import { useRef, useTransition } from "react"
import { CameraIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { iniciales } from "@/lib/formato"

import { quitarFotoSocio, subirFotoSocio } from "./actions"

const LADO = 800

// Recorta el centro de la imagen en un cuadrado de 800px y la pasa a webp
// (jpeg si el navegador no sabe hacer webp). Así cualquier foto del celular
// queda liviana (~100 KB) y entra en el límite de las server actions.
async function prepararFoto(archivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo)
  const lado = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = Math.min(LADO, lado)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("El navegador no puede procesar la imagen")
  ctx.drawImage(bitmap, (bitmap.width - lado) / 2, (bitmap.height - lado) / 2, lado, lado, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const comoBlob = (tipo: string) =>
    new Promise<Blob | null>((ok) => canvas.toBlob(ok, tipo, 0.85))
  const webp = await comoBlob("image/webp")
  if (webp?.type === "image/webp") return webp
  const jpeg = await comoBlob("image/jpeg")
  if (!jpeg) throw new Error("No se pudo convertir la imagen")
  return jpeg
}

// Foto de un socio para el equipo de la web: miniatura, subir/cambiar y quitar.
// La foto se publica en el momento; `onCambio` le avisa al editor la URL nueva.
export function FotoSocio({
  socioId,
  nombre,
  url,
  onCambio,
}: {
  socioId: string
  nombre: string
  url: string | null
  onCambio: (url: string | null) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  function onArchivo(archivo: File | undefined) {
    if (!archivo) return
    iniciarTransicion(async () => {
      try {
        const blob = await prepararFoto(archivo)
        const datos = new FormData()
        datos.set("foto", new File([blob], `foto.${blob.type.split("/")[1]}`, { type: blob.type }))
        onCambio(await subirFotoSocio(socioId, datos))
        toast.success(`Foto de ${nombre} actualizada`)
      } catch (e) {
        toast.error(e instanceof Error && e.message !== "The source image could not be decoded." ? e.message : "No se pudo leer esa imagen. Probá con un JPG o PNG.")
      } finally {
        if (input.current) input.current.value = ""
      }
    })
  }

  function quitar() {
    iniciarTransicion(async () => {
      try {
        await quitarFotoSocio(socioId)
        onCambio(null)
        toast.success(`Se quitó la foto de ${nombre}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo quitar la foto")
      }
    })
  }

  return (
    <div className="flex items-center gap-3">
      <span className="relative inline-flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-sm font-bold">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto pública de Storage, miniatura chica
          <img src={url} alt={`Foto de ${nombre}`} className="size-full object-cover" />
        ) : (
          <span aria-hidden="true" className="text-lg">{iniciales(nombre)}</span>
        )}
        {pendiente && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Spinner />
          </span>
        )}
      </span>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onArchivo(e.target.files?.[0])}
      />
      <Button type="button" variant="outline" size="sm" disabled={pendiente} onClick={() => input.current?.click()}>
        <CameraIcon data-icon="inline-start" />
        {url ? "Cambiar" : "Subir foto"}
      </Button>
      {url && (
        <Button type="button" variant="ghost" size="icon-sm" disabled={pendiente} onClick={quitar} aria-label={`Quitar la foto de ${nombre}`}>
          <XIcon />
        </Button>
      )}
    </div>
  )
}

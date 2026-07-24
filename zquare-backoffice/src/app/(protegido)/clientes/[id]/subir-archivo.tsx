"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { UploadIcon } from "lucide-react"

import { SelectCampo } from "@/components/select-campo"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import { iniciarSubida } from "./subir-actions"

// Sube los bytes directo a la URL de sesión de Drive (navegador → Google).
// Usa XHR para reportar progreso; la URL ya viene autorizada, sin credenciales.
function subirBytes(
  url: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    if (file.type) xhr.setRequestHeader("Content-Type", file.type)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Falló la subida (${xhr.status})`))
    xhr.onerror = () => reject(new Error("Error de red al subir a Drive"))
    xhr.send(file)
  })
}

export function SubirArchivo({
  carpetaPadreId,
  subcarpetas = [],
}: {
  carpetaPadreId: string
  subcarpetas?: string[]
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [subcarpeta, setSubcarpeta] = useState("")
  const [progreso, setProgreso] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const subiendo = progreso !== null

  const opcionesDestino = [
    { valor: "", label: "Raíz del cliente" },
    ...subcarpetas.map((s) => ({ valor: s, label: s })),
  ]

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setProgreso(0)
    try {
      const { url } = await iniciarSubida(
        carpetaPadreId,
        subcarpeta || null,
        file.name,
        file.type
      )
      await subirBytes(url, file, setProgreso)
      setProgreso(null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir")
      setProgreso(null)
    } finally {
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {subcarpetas.length > 0 && (
          <SelectCampo
            name="subcarpeta"
            defaultValue={subcarpeta}
            opciones={opcionesDestino}
            onValueChange={setSubcarpeta}
            triggerClassName="w-40"
          />
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={onArchivo}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={subiendo}
          onClick={() => inputRef.current?.click()}
        >
          {subiendo ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <UploadIcon data-icon="inline-start" />
          )}
          {subiendo ? `Subiendo… ${progreso}%` : "Subir archivo"}
        </Button>
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}

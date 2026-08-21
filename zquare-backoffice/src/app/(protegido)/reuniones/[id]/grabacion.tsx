"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  CircleIcon,
  FileTextIcon,
  MicIcon,
  MonitorIcon,
  RefreshCwIcon,
  SquareIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type { GrabacionReunion } from "@/lib/dominio"

import {
  descartarParte,
  generarDocumento,
  iniciarSubidaAudio,
  registrarParte,
  reintentarParte,
  transcribirPendiente,
} from "./grabacion-actions"

// Grabador de reuniones. Dos modos:
// - Videollamada: además del micrófono se pide compartir la pestaña del Meet
//   (con su audio) y se mezclan las dos fuentes — con el micrófono solo no se
//   escucha a los del otro lado.
// - Presencial: micrófono y listo.
// El audio se corta en partes de ~15 minutos; cada parte es un webm/opus
// independiente que el navegador sube directo a Drive y que Whisper
// transcribe entera dentro del límite de tiempo de una función de Vercel.

const PARTE_MS = 15 * 60 * 1000
// Opus a 32 kbps mono: voz clara y ~4 MB por parte de 15 min.
const BITRATE = 32_000
// Techo del loop de transcripción, por si algo queda ciclando.
const MAX_PASADAS = 60

function mimeGrabacion(): string {
  const candidatos = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
  for (const c of candidatos) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c))
      return c
  }
  return ""
}

// Sube los bytes a la URL de sesión resumable y devuelve el archivo creado.
function subirBytes(
  url: string,
  blob: Blob
): Promise<{ id: string; webViewLink?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    if (blob.type) xhr.setRequestHeader("Content-Type", blob.type)
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Falló la subida a Drive (${xhr.status})`))
        return
      }
      try {
        resolve(JSON.parse(xhr.responseText))
      } catch {
        reject(new Error("Drive no devolvió el archivo creado"))
      }
    }
    xhr.onerror = () => reject(new Error("Error de red al subir a Drive"))
    xhr.send(blob)
  })
}

const ETIQUETA_ESTADO: Record<
  GrabacionReunion["estado"],
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  subida: { label: "Sin transcribir", variant: "secondary" },
  transcripta: { label: "Transcripta", variant: "default" },
  error: { label: "Error", variant: "outline" },
}

type Fase =
  | { tipo: "inactivo" }
  | { tipo: "grabando"; desde: number; conPestana: boolean }
  | { tipo: "subiendo" }
  | { tipo: "transcribiendo"; restantes: number }

export function Grabacion({
  solicitudId,
  codigo,
  partes,
  transcripcionUrl,
}: {
  solicitudId: string
  codigo: string
  partes: GrabacionReunion[]
  transcripcionUrl: string | null
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fase, setFase] = useState<Fase>({ tipo: "inactivo" })
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Todo lo vivo de la grabación en curso, fuera del estado de React: el
  // recorder se rota cada PARTE_MS y los uploads corren en paralelo.
  const vivo = useRef<{
    streams: MediaStream[]
    ctx: AudioContext | null
    recorder: MediaRecorder | null
    rotacion: ReturnType<typeof setInterval> | null
    subidas: Promise<void>[]
    parte: number
    deteniendo: boolean
  } | null>(null)

  const ocupado = fase.tipo !== "inactivo"

  async function subirParte(blob: Blob, extension: string) {
    const sesion = vivo.current
    const parte = sesion ? ++sesion.parte : 1
    const fecha = new Date().toISOString().slice(0, 10)
    const nombre = `${codigo} — Audio ${fecha} — parte ${parte}.${extension}`
    const { url } = await iniciarSubidaAudio(solicitudId, nombre, blob.type)
    const archivo = await subirBytes(url, blob)
    const resultado = await registrarParte(
      solicitudId,
      nombre,
      archivo.id,
      archivo.webViewLink ?? null
    )
    if (!resultado.ok) throw new Error(resultado.error)
  }

  // Transcribe las partes pendientes de a una y después arma el Google Doc.
  async function transcribirTodo() {
    for (let i = 0; i < MAX_PASADAS; i++) {
      const r = await transcribirPendiente(solicitudId)
      setFase({ tipo: "transcribiendo", restantes: r.pendientes })
      if (r.error) setError(r.error)
      if (r.pendientes === 0) break
    }
    const doc = await generarDocumento(solicitudId)
    if (!doc.ok && doc.error) setError(doc.error)
  }

  function iniciarRecorder(destino: MediaStream, mime: string) {
    const sesion = vivo.current
    if (!sesion) return
    const recorder = new MediaRecorder(destino, {
      mimeType: mime || undefined,
      audioBitsPerSecond: BITRATE,
    })
    const pedazos: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) pedazos.push(e.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(pedazos, { type: mime || "audio/webm" })
      if (blob.size === 0) return
      const extension = mime.includes("mp4") ? "m4a" : "webm"
      sesion.subidas.push(
        subirParte(blob, extension).catch((e) => {
          setError(e instanceof Error ? e.message : "No se pudo subir una parte")
        })
      )
    }
    recorder.start()
    sesion.recorder = recorder
  }

  async function empezarGrabacion(conPestana: boolean) {
    setError(null)
    setAviso(null)
    try {
      const streams: MediaStream[] = []
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
      streams.push(mic)

      let pestana: MediaStream | null = null
      if (conPestana) {
        // El audio de los demás participantes solo se captura compartiendo la
        // pestaña del Meet (con "compartir audio" tildado).
        pestana = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        })
        streams.push(pestana)
        if (pestana.getAudioTracks().length === 0) {
          setAviso(
            "La pestaña compartida no trae audio: se está grabando solo tu micrófono. Al compartir, elegí la pestaña del Meet y tildá «Compartir audio de la pestaña»."
          )
        }
      }

      const ctx = new AudioContext()
      const destino = ctx.createMediaStreamDestination()
      ctx.createMediaStreamSource(mic).connect(destino)
      if (pestana && pestana.getAudioTracks().length > 0) {
        ctx
          .createMediaStreamSource(new MediaStream(pestana.getAudioTracks()))
          .connect(destino)
      }

      vivo.current = {
        streams,
        ctx,
        recorder: null,
        rotacion: null,
        subidas: [],
        parte: partes.length,
        deteniendo: false,
      }

      const mime = mimeGrabacion()
      iniciarRecorder(destino.stream, mime)

      // Rotar el recorder cada PARTE_MS: el stop dispara la subida de la
      // parte cerrada y arranca una nueva sobre el mismo stream mezclado.
      vivo.current.rotacion = setInterval(() => {
        const sesion = vivo.current
        if (!sesion?.recorder || sesion.deteniendo) return
        sesion.recorder.stop()
        iniciarRecorder(destino.stream, mime)
      }, PARTE_MS)

      // Si dejan de compartir la pestaña desde el control del navegador, la
      // grabación sigue con el micrófono.
      pestana?.getVideoTracks()[0]?.addEventListener("ended", () => {
        setAviso("Se dejó de compartir la pestaña: sigue grabando solo el micrófono.")
      })

      setFase({ tipo: "grabando", desde: Date.now(), conPestana })
    } catch (e) {
      // Cancelar el diálogo de compartir/micrófono no es un error a gritar.
      const nombre = (e as DOMException)?.name
      if (nombre !== "NotAllowedError" && nombre !== "AbortError") {
        setError(e instanceof Error ? e.message : "No se pudo empezar a grabar")
      }
      vivo.current?.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()))
      vivo.current = null
      setFase({ tipo: "inactivo" })
    }
  }

  async function detenerGrabacion() {
    const sesion = vivo.current
    if (!sesion) return
    sesion.deteniendo = true
    if (sesion.rotacion) clearInterval(sesion.rotacion)
    setFase({ tipo: "subiendo" })
    try {
      if (sesion.recorder && sesion.recorder.state !== "inactive") {
        // Esperar el onstop real: ahí se encola la subida de la última parte.
        await new Promise<void>((resolve) => {
          sesion.recorder!.addEventListener("stop", () => resolve(), { once: true })
          sesion.recorder!.stop()
        })
      }
      sesion.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()))
      await sesion.ctx?.close().catch(() => {})
      await Promise.all(sesion.subidas)
      await transcribirTodo()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falló el cierre de la grabación")
    } finally {
      vivo.current = null
      setFase({ tipo: "inactivo" })
      router.refresh()
    }
  }

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setFase({ tipo: "subiendo" })
    try {
      const { url } = await iniciarSubidaAudio(solicitudId, file.name, file.type)
      const archivo = await subirBytes(url, file)
      const resultado = await registrarParte(
        solicitudId,
        file.name,
        archivo.id,
        archivo.webViewLink ?? null
      )
      if (!resultado.ok) throw new Error(resultado.error)
      await transcribirTodo()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el audio")
    } finally {
      if (inputRef.current) inputRef.current.value = ""
      setFase({ tipo: "inactivo" })
      router.refresh()
    }
  }

  async function onReintentar(grabacionId: string) {
    setError(null)
    setFase({ tipo: "transcribiendo", restantes: 1 })
    try {
      await reintentarParte(solicitudId, grabacionId)
      await transcribirTodo()
    } finally {
      setFase({ tipo: "inactivo" })
      router.refresh()
    }
  }

  async function onDescartar(grabacionId: string) {
    await descartarParte(solicitudId, grabacionId)
    // Rearmar el doc sin la parte descartada, si ya había algo transcripto.
    if (partes.some((p) => p.id !== grabacionId && p.estado === "transcripta")) {
      await generarDocumento(solicitudId)
    }
    router.refresh()
  }

  const pendientes = partes.filter((p) => p.estado === "subida").length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Grabación y transcripción</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {fase.tipo === "grabando" ? (
            <Button variant="destructive" size="sm" onClick={detenerGrabacion}>
              <SquareIcon data-icon="inline-start" />
              Detener y transcribir
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={ocupado}
                onClick={() => empezarGrabacion(true)}
              >
                <MonitorIcon data-icon="inline-start" />
                Grabar videollamada
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={ocupado}
                onClick={() => empezarGrabacion(false)}
              >
                <MicIcon data-icon="inline-start" />
                Grabar presencial
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept="audio/*,.m4a,.mp3,.ogg,.opus,.wav,.webm"
                className="hidden"
                onChange={onArchivo}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={ocupado}
                onClick={() => inputRef.current?.click()}
              >
                <UploadIcon data-icon="inline-start" />
                Subir audio
              </Button>
              {pendientes > 0 && !ocupado && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    setError(null)
                    setFase({ tipo: "transcribiendo", restantes: pendientes })
                    try {
                      await transcribirTodo()
                    } finally {
                      setFase({ tipo: "inactivo" })
                      router.refresh()
                    }
                  }}
                >
                  <RefreshCwIcon data-icon="inline-start" />
                  Transcribir pendientes
                </Button>
              )}
            </>
          )}

          {fase.tipo === "grabando" && (
            <span className="flex items-center gap-1.5 text-sm text-destructive">
              <CircleIcon className="size-3 animate-pulse fill-current" />
              Grabando{fase.conPestana ? " (micrófono + pestaña)" : " (micrófono)"}
            </span>
          )}
          {fase.tipo === "subiendo" && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Spinner className="size-3.5" /> Subiendo audio a Drive…
            </span>
          )}
          {fase.tipo === "transcribiendo" && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Spinner className="size-3.5" /> Transcribiendo…
              {fase.restantes > 0 ? ` faltan ${fase.restantes}` : ""}
            </span>
          )}
        </div>

        {fase.tipo === "grabando" && fase.conPestana && (
          <p className="text-xs text-muted-foreground">
            Para que se escuche a los demás, al compartir hay que elegir la
            pestaña del Meet y tildar «Compartir audio de la pestaña».
          </p>
        )}
        {aviso && <p className="text-sm text-amber-600">{aviso}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {transcripcionUrl && (
          <div>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <a href={transcripcionUrl} target="_blank" rel="noreferrer" />
              }
            >
              <FileTextIcon data-icon="inline-start" />
              Ver transcripción en Drive
            </Button>
          </div>
        )}

        {partes.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {partes.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={ETIQUETA_ESTADO[p.estado].variant}>
                  {ETIQUETA_ESTADO[p.estado].label}
                </Badge>
                {p.drive_audio_url ? (
                  <a
                    href={p.drive_audio_url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline-offset-4 hover:underline"
                  >
                    {p.nombre}
                  </a>
                ) : (
                  <span>{p.nombre}</span>
                )}
                {p.estado === "error" && (
                  <>
                    <span className="text-xs text-destructive">{p.error}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={ocupado}
                      onClick={() => onReintentar(p.id)}
                    >
                      <RefreshCwIcon data-icon="inline-start" />
                      Reintentar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={ocupado}
                      onClick={() => onDescartar(p.id)}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      Descartar
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

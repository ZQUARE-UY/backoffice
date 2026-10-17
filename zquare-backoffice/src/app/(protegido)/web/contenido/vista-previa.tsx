"use client"

import { useEffect, useRef, useState } from "react"
import { ExternalLinkIcon, MonitorIcon, SmartphoneIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Idioma } from "@/lib/contenido-web"
import { cn } from "@/lib/utils"

export type Dispositivo = "escritorio" | "celular"

const ANCHO: Record<Dispositivo, number> = { escritorio: 1280, celular: 390 }

// zquare.uy dentro de un iframe en modo vista previa (?vista_previa=1). La
// web escucha mensajes de este origen y pinta el borrador sin guardarlo ni
// contar la visita (ver index.html y analytics.js de la web). El de
// escritorio se dibuja a 1280px y se achica para entrar en el panel.
export function VistaPrevia({
  webUrl,
  contenido,
  idioma,
  seccion,
  dispositivo,
  onDispositivo,
}: {
  webUrl: string
  contenido: unknown
  idioma: Idioma
  seccion: string
  dispositivo: Dispositivo
  onDispositivo: (d: Dispositivo) => void
}) {
  const marco = useRef<HTMLIFrameElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const [medida, setCaja2] = useState({ ancho: 0, alto: 0 })
  // Cuántas veces avisó la web que cargó: si el iframe se recarga, vuelve a
  // avisar y se le manda todo de nuevo.
  const [lista, setLista] = useState(0)
  const origenWeb = new URL(webUrl).origin

  // La web avisa cuando cargó y está escuchando. Como puede cargar antes que
  // este componente (o después), además la saludamos cada segundo hasta que
  // conteste.
  useEffect(() => {
    function onMensaje(e: MessageEvent) {
      if (e.origin === origenWeb && e.data?.zq === "lista") setLista((n) => n + 1)
    }
    window.addEventListener("message", onMensaje)
    return () => window.removeEventListener("message", onMensaje)
  }, [origenWeb])
  useEffect(() => {
    if (lista) return
    const saludo = setInterval(() => marco.current?.contentWindow?.postMessage({ zq: "hola" }, origenWeb), 1000)
    return () => clearInterval(saludo)
  }, [lista, origenWeb])

  const enviar = (mensaje: Record<string, unknown>) => marco.current?.contentWindow?.postMessage(mensaje, origenWeb)

  useEffect(() => {
    if (lista) enviar({ zq: "contenido", contenido })
  }, [lista, contenido]) // eslint-disable-line react-hooks/exhaustive-deps -- enviar depende solo del iframe
  useEffect(() => {
    if (lista) enviar({ zq: "idioma", lang: idioma })
  }, [lista, idioma]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (lista) enviar({ zq: "ir", seccion })
  }, [lista, seccion, dispositivo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = caja.current
    if (!el) return
    const observador = new ResizeObserver(([e]) => setCaja2({ ancho: e.contentRect.width, alto: e.contentRect.height }))
    observador.observe(el)
    return () => observador.disconnect()
  }, [])

  // La web se dibuja a su ancho real y se achica para entrar; el alto
  // acompaña para llenar la caja, que ocupa el alto de la pantalla.
  const ancho = ANCHO[dispositivo]
  const escala = medida.ancho ? Math.min(1, medida.ancho / ancho) : 1
  const alto = medida.alto ? medida.alto / escala : 760

  return (
    <section aria-label="Vista previa de zquare.uy" className="flex min-h-0 min-w-0 flex-col gap-3 py-4 escritorio:px-6 escritorio:py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-sm text-muted-foreground">Vista previa · así se ve zquare.uy con tus cambios</p>
        <div className="flex items-center gap-1">
          <div className="zq-pildoras" role="group" aria-label="Dispositivo">
            {(["escritorio", "celular"] as const).map((d) => (
              <button key={d} type="button" aria-pressed={dispositivo === d} onClick={() => onDispositivo(d)} className="zq-pildora-boton">
                {d === "escritorio" ? <MonitorIcon className="size-3.5" aria-hidden /> : <SmartphoneIcon className="size-3.5" aria-hidden />}
                {d === "escritorio" ? "Escritorio" : "Celular"}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon-sm" nativeButton={false} render={<a href={webUrl} target="_blank" rel="noreferrer" aria-label="Abrir zquare.uy en otra pestaña" />}>
            <ExternalLinkIcon />
          </Button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-muted/60 p-3">
        <div ref={caja} className="flex h-[70dvh] justify-center overflow-hidden escritorio:h-auto escritorio:min-h-0 escritorio:flex-1">
          <div
            className={cn("shrink-0 origin-top overflow-hidden bg-white shadow-sm", dispositivo === "celular" ? "rounded-[28px] border-[6px] border-foreground/80" : "rounded-lg")}
            style={{ width: ancho, height: alto, transform: `scale(${escala})` }}
          >
            <iframe
              ref={marco}
              src={`${webUrl}/?vista_previa=1`}
              title="Vista previa de zquare.uy"
              className="block size-full border-0"
            />
          </div>
        </div>
        {!lista && (
          <p className="absolute inset-x-0 bottom-4 m-0 text-center text-xs text-muted-foreground">Cargando la web…</p>
        )}
      </div>
    </section>
  )
}

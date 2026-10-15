"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { Dialog } from "@base-ui/react/dialog"
import {
  BellIcon,
  FolderKanbanIcon,
  KanbanIcon,
  ScrollTextIcon,
  WalletIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"

import type { GrupoNotificacion, Notificacion } from "@/lib/notificaciones"
import { cn } from "@/lib/utils"

// Campanita + panel lateral de notificaciones. Las notificaciones vienen del
// server (lib/notificaciones.ts); qué leyó cada socio vive en su navegador
// como la lista de ids vistos. Al cerrar el panel, todo lo que se mostró
// queda leído.

const CLAVE = "zq:notificaciones-leidas"
const EVENTO = "zq:notificaciones-leidas"
// Tope para que la lista no crezca para siempre: los ids viejos salen de la
// ventana de días y dejan de importar.
const MAX_IDS = 300

function suscribir(alCambiar: () => void) {
  window.addEventListener("storage", alCambiar)
  window.addEventListener(EVENTO, alCambiar)
  return () => {
    window.removeEventListener("storage", alCambiar)
    window.removeEventListener(EVENTO, alCambiar)
  }
}

function leerCrudo(): string {
  try {
    return localStorage.getItem(CLAVE) ?? "[]"
  } catch {
    return "[]"
  }
}

// En el server no se sabe qué leyó: se asume todo leído para no mostrar un
// contador que después desaparece al hidratar.
function leerEnServer(): string | null {
  return null
}

function marcarLeidas(ids: string[]) {
  try {
    const previas = JSON.parse(leerCrudo()) as string[]
    const todas = Array.from(new Set([...ids, ...previas])).slice(0, MAX_IDS)
    localStorage.setItem(CLAVE, JSON.stringify(todas))
  } catch {
    // Sin storage (modo privado): las notificaciones quedan sin leer.
  }
  window.dispatchEvent(new Event(EVENTO))
}

function useLeidas(): Set<string> | null {
  const crudo = useSyncExternalStore(suscribir, leerCrudo, leerEnServer)
  return useMemo(() => {
    if (crudo === null) return null
    try {
      return new Set(JSON.parse(crudo) as string[])
    } catch {
      return new Set()
    }
  }, [crudo])
}

const GRUPOS: {
  grupo: GrupoNotificacion
  titulo: string
  icono: LucideIcon
  clase: string
}[] = [
  { grupo: "proyectos", titulo: "Proyectos", icono: FolderKanbanIcon, clase: "bg-lima text-carbon" },
  { grupo: "decisiones", titulo: "Decisiones", icono: ScrollTextIcon, clase: "bg-foreground text-background" },
  { grupo: "tareas", titulo: "Tareas", icono: KanbanIcon, clase: "bg-muted text-foreground" },
  { grupo: "finanzas", titulo: "Finanzas", icono: WalletIcon, clase: "bg-arena text-carbon" },
]

export function Campanita({
  notificaciones,
  className,
}: {
  notificaciones: Notificacion[]
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const leidas = useLeidas()
  // Lo que estaba sin leer al abrir sigue marcado como tal mientras el panel
  // está abierto; recién al cerrarlo pasa a leído.
  const [sinLeerAlAbrir, setSinLeerAlAbrir] = useState<Set<string>>(new Set())

  const sinLeer = leidas ? notificaciones.filter((n) => !leidas.has(n.id)).length : 0

  function cambiar(abrir: boolean) {
    if (abrir) {
      setSinLeerAlAbrir(new Set(notificaciones.filter((n) => !leidas?.has(n.id)).map((n) => n.id)))
    } else {
      marcarLeidas(notificaciones.map((n) => n.id))
    }
    setAbierto(abrir)
  }

  const etiqueta =
    sinLeer > 0
      ? `Notificaciones, ${sinLeer} ${sinLeer === 1 ? "nueva" : "nuevas"}`
      : "Notificaciones"

  return (
    <Dialog.Root open={abierto} onOpenChange={cambiar}>
      <Dialog.Trigger className={cn("zq-tactil", className)} aria-label={etiqueta}>
        <BellIcon className="size-[18px]" aria-hidden="true" />
        {sinLeer > 0 && (
          <span className="zq-contador" aria-hidden="true">
            {sinLeer > 9 ? "9+" : sinLeer}
          </span>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="zq-panel-velo" />
        <Dialog.Popup className="zq-panel-lateral" aria-labelledby="notificaciones-titulo">
          <div className="flex items-center justify-between px-6 pt-6 pb-4">
            <Dialog.Title
              id="notificaciones-titulo"
              className="m-0 font-display text-2xl leading-[30px] font-normal"
            >
              Notificaciones
            </Dialog.Title>
            <Dialog.Close className="zq-tactil text-muted-foreground" aria-label="Cerrar">
              <XIcon className="size-[18px]" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-6">
            {notificaciones.length === 0 && (
              <p className="border-t px-3 pt-4 text-muted-foreground">
                Nada nuevo en las últimas dos semanas.
              </p>
            )}
            {GRUPOS.map(({ grupo, titulo, icono: Icono, clase }) => {
              const items = notificaciones.filter((n) => n.grupo === grupo)
              if (items.length === 0) return null
              return (
                <section key={grupo} className="border-t pt-3.5 pb-2.5">
                  <div className="flex items-center gap-2.5 px-3 pb-2">
                    <span className={cn("zq-cuadradito", clase)} aria-hidden="true">
                      <Icono />
                    </span>
                    <h3 className="m-0 text-[13px] leading-[18px] font-semibold">{titulo}</h3>
                  </div>
                  <ul className="m-0 list-none p-0">
                    {items.map((n) => {
                      const nueva = sinLeerAlAbrir.has(n.id)
                      return (
                        <li key={n.id}>
                          <Link
                            href={n.href}
                            onClick={() => cambiar(false)}
                            className="flex items-start gap-2.5 rounded-lg py-2 pr-3 pl-[50px] text-foreground no-underline hover:bg-muted"
                          >
                            <span className="flex min-w-0 flex-1 flex-col gap-px">
                              <span className={nueva ? "font-medium" : "text-muted-foreground"}>
                                {n.texto}
                              </span>
                              <span className="text-xs leading-4 text-muted-foreground">
                                {n.detalle}
                              </span>
                            </span>
                            {nueva ? (
                              <span
                                className="mt-1.5 size-2 flex-none rounded-full bg-foreground"
                                aria-label="Sin leer"
                              />
                            ) : (
                              <span className="w-2 flex-none" />
                            )}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Dialog } from "@base-ui/react/dialog"
import { MenuIcon, PlusIcon, XIcon } from "lucide-react"

import { EVENTO_CREAR } from "@/components/captura-rapida"
import { UserMenu } from "@/components/user-menu"
import { GRUPOS_NAV, seccionActiva, tituloSeccion } from "@/components/zq/navegacion"
import { Campanita } from "@/components/zq/panel-notificaciones"
import type { Notificacion } from "@/lib/notificaciones"

// Navegación de celular (menos de 720px): barra superior con ☰, el título de
// la sección y la campanita. El ☰ abre el menú a pantalla completa sobre el
// fondo del sidebar.
export function BarraMovil({
  nombre,
  email,
  notificaciones,
}: {
  nombre: string
  email: string
  notificaciones: Notificacion[]
}) {
  const pathname = usePathname()
  const [abierto, setAbierto] = useState(false)

  return (
    <header className="zq-barra-movil escritorio:hidden">
      <Dialog.Root open={abierto} onOpenChange={setAbierto}>
        <Dialog.Trigger className="zq-tactil" aria-label="Abrir menú">
          <MenuIcon className="size-[22px]" aria-hidden="true" />
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Popup className="zq-menu-movil" aria-label="Menú">
            <Dialog.Title className="sr-only">Menú</Dialog.Title>
            <div className="flex items-center justify-between pb-3 pl-3.5">
              <Image src="/marca/zquare-logotipo-sobre-oscuro.svg" alt="ZQUARE" width={103} height={26} />
              <Dialog.Close className="zq-tactil" aria-label="Cerrar menú">
                <XIcon className="size-[22px]" aria-hidden="true" />
              </Dialog.Close>
            </div>
            <nav className="flex flex-col gap-0.5">
              {GRUPOS_NAV.map((grupo) => (
                <div key={grupo.label ?? "principal"} className="flex flex-col gap-0.5">
                  {grupo.label && (
                    <p className="zq-sidebar-seccion mx-3.5 mt-3.5 mb-1">{grupo.label}</p>
                  )}
                  {grupo.secciones.map((s) => (
                    <Link
                      key={s.href}
                      href={s.href}
                      onClick={() => setAbierto(false)}
                      className="zq-menu-movil-item"
                      aria-current={seccionActiva(s.href, pathname) ? "page" : undefined}
                    >
                      {s.titulo}
                    </Link>
                  ))}
                </div>
              ))}
            </nav>
            <div className="mt-auto border-t border-sidebar-border pt-3">
              <UserMenu nombre={nombre} email={email} />
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <p className="zq-barra-movil-titulo">{tituloSeccion(pathname)}</p>

      <Campanita notificaciones={notificaciones} />
    </header>
  )
}

// Botón flotante para crear (celular): carbón con "+" lima, abajo a la
// derecha. Por ahora abre la captura rápida de tarea o idea; las pantallas
// que tengan su propio "crear" lo van a reemplazar (Paso 3).
export function BotonCrear() {
  return (
    <button
      type="button"
      className="zq-fab escritorio:hidden"
      aria-label="Crear tarea o idea"
      onClick={() => window.dispatchEvent(new Event(EVENTO_CREAR))}
    >
      <PlusIcon aria-hidden="true" />
    </button>
  )
}

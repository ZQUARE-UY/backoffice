"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { BusquedaGlobal } from "@/components/busqueda-global"
import { UserMenu } from "@/components/user-menu"
import { GRUPOS_NAV, seccionActiva } from "@/components/zq/navegacion"
import { Campanita } from "@/components/zq/panel-notificaciones"
import type { Notificacion } from "@/lib/notificaciones"

// Sidebar carbón de 240px (escritorio, 720px o más): logo arriba con la
// campanita a la derecha, buscador, secciones y el usuario al pie. El ítem
// activo va en lima. Debajo de 720px lo reemplaza el menú de celular.
export function AppSidebar({
  nombre,
  email,
  notificaciones,
  // Reuniones esperando que este socio marque su disponibilidad.
  pendientesReuniones = 0,
}: {
  nombre: string
  email: string
  notificaciones: Notificacion[]
  pendientesReuniones?: number
}) {
  const pathname = usePathname()

  return (
    <aside className="zq-sidebar hidden escritorio:flex" aria-label="Navegación principal">
      <div className="mb-4 flex items-center justify-between gap-2 pl-2.5">
        <Link href="/" aria-label="ZQUARE, ir al inicio" className="rounded-md">
          <Image
            src="/marca/zquare-logotipo-sobre-oscuro.svg"
            alt=""
            width={103}
            height={26}
            priority
          />
        </Link>
        <Campanita notificaciones={notificaciones} className="-mr-1 text-sidebar-foreground" />
      </div>
      <BusquedaGlobal className="mb-1 border-sidebar-border bg-sidebar-accent text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground" />
      <nav className="flex flex-col gap-0.5">
        {GRUPOS_NAV.map((grupo) => (
          <div key={grupo.label ?? "principal"} className="flex flex-col gap-0.5">
            {grupo.label ? (
              <p className="zq-sidebar-seccion">{grupo.label}</p>
            ) : (
              <span className="h-3" aria-hidden="true" />
            )}
            {grupo.secciones.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="zq-nav-item"
                aria-current={seccionActiva(s.href, pathname) ? "page" : undefined}
              >
                <s.icono className="size-4" aria-hidden="true" />
                <span className="flex-1">{s.titulo}</span>
                {s.href === "/reuniones" && pendientesReuniones > 0 && (
                  <span
                    className="zq-num rounded-full bg-sidebar-accent px-2 text-xs leading-5 font-semibold text-sidebar-foreground"
                    aria-label={`${pendientesReuniones} esperando tu disponibilidad`}
                  >
                    {pendientesReuniones}
                  </span>
                )}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-auto border-t border-sidebar-border pt-3">
        <UserMenu nombre={nombre} email={email} />
      </div>
    </aside>
  )
}

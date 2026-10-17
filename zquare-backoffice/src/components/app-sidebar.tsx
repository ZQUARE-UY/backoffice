"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react"

import { BusquedaGlobal } from "@/components/busqueda-global"
import { UserMenu } from "@/components/user-menu"
import { COOKIE_SIDEBAR, GRUPOS_NAV, seccionActiva } from "@/components/zq/navegacion"
import { Campanita } from "@/components/zq/panel-notificaciones"
import { SelectorTema } from "@/components/zq/selector-tema"
import type { Notificacion } from "@/lib/notificaciones"

// Sidebar carbón de 240px (escritorio, 720px o más): logo arriba con la
// campanita y el botón de colapsar a la derecha, buscador, secciones y el
// usuario al pie. El ítem activo va en lima. Debajo de 720px lo reemplaza el
// menú de celular. Colapsado queda en 64px, solo íconos y sin logo (en Inicio
// ya está el isotipo grande); el estado va en una
// cookie que el layout lee al renderizar.
const RUTAS_ANCHAS = ["/web/contenido"]

export function AppSidebar({
  nombre,
  email,
  notificaciones,
  // Reuniones esperando que este socio marque su disponibilidad.
  pendientesReuniones = 0,
  // Consultas de la web sin revisar.
  consultasNuevas = 0,
  // Chats de la web sin revisar.
  chatsNuevos = 0,
  colapsadoInicial = false,
}: {
  nombre: string
  email: string
  notificaciones: Notificacion[]
  pendientesReuniones?: number
  consultasNuevas?: number
  chatsNuevos?: number
  colapsadoInicial?: boolean
}) {
  const pathname = usePathname()
  const [preferencia, setPreferencia] = useState(colapsadoInicial)
  // Pantallas que necesitan el ancho (el editor de Web → Contenido): ahí el
  // sidebar arranca colapsado sin tocar la preferencia guardada. Si lo
  // expandís a mano en esa pantalla se respeta hasta que salís de ella.
  const colapsaSolo = RUTAS_ANCHAS.includes(pathname)
  const [expandidoEn, setExpandidoEn] = useState<string | null>(null)
  const colapsado = colapsaSolo ? expandidoEn !== pathname : preferencia
  // Contador al lado de la sección (globito si el sidebar está colapsado).
  const contadores: Record<string, { n: number; etiqueta: string }> = {
    "/reuniones": { n: pendientesReuniones, etiqueta: "esperando tu disponibilidad" },
    "/web": { n: consultasNuevas, etiqueta: consultasNuevas === 1 ? "consulta nueva" : "consultas nuevas" },
    "/web/chats": { n: chatsNuevos, etiqueta: chatsNuevos === 1 ? "chat nuevo" : "chats nuevos" },
  }

  function alternar() {
    if (colapsaSolo) {
      setExpandidoEn(colapsado ? pathname : null)
      return
    }
    const nuevo = !preferencia
    setPreferencia(nuevo)
    document.cookie = `${COOKIE_SIDEBAR}=${nuevo ? "colapsado" : "expandido"}; path=/; max-age=31536000; samesite=lax`
  }

  const botonAlternar = (
    <button
      type="button"
      onClick={alternar}
      className="zq-tactil text-sidebar-muted hover:text-sidebar-foreground"
      aria-label={colapsado ? "Expandir menú" : "Colapsar menú"}
      aria-expanded={!colapsado}
      title={colapsado ? "Expandir menú" : "Colapsar menú"}
    >
      {colapsado ? (
        <PanelLeftOpenIcon className="size-[18px]" aria-hidden="true" />
      ) : (
        <PanelLeftCloseIcon className="size-[18px]" aria-hidden="true" />
      )}
    </button>
  )

  return (
    <aside
      className="zq-sidebar hidden escritorio:flex"
      aria-label="Navegación principal"
      data-colapsado={colapsado || undefined}
    >
      {colapsado ? (
        <div className="mb-3 flex flex-col items-center gap-1">
          <Campanita notificaciones={notificaciones} className="text-sidebar-foreground" />
          {botonAlternar}
        </div>
      ) : (
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
          <div className="-mr-1 flex items-center">
            <Campanita notificaciones={notificaciones} className="text-sidebar-foreground" />
            {botonAlternar}
          </div>
        </div>
      )}
      <BusquedaGlobal
        compacto={colapsado}
        className="mb-1 border-sidebar-border bg-sidebar-accent text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
      />
      <nav className="zq-sidebar-nav flex flex-col gap-0.5">
        {GRUPOS_NAV.map((grupo) => (
          <div key={grupo.label ?? "principal"} className="flex flex-col gap-0.5">
            {grupo.label && !colapsado ? (
              <p className="zq-sidebar-seccion">{grupo.label}</p>
            ) : grupo.label ? (
              <hr className="mx-2 my-3 border-sidebar-border" />
            ) : (
              <span className="h-3" aria-hidden="true" />
            )}
            {grupo.secciones.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="zq-nav-item"
                aria-current={seccionActiva(s.href, pathname, s.exacta) ? "page" : undefined}
                aria-label={
                  colapsado
                    ? [s.titulo, contadores[s.href]?.n ? `${contadores[s.href].n} ${contadores[s.href].etiqueta}` : ""]
                        .filter(Boolean)
                        .join(", ")
                    : undefined
                }
                title={colapsado ? s.titulo : undefined}
              >
                <s.icono className="size-4" aria-hidden="true" />
                {!colapsado && <span className="flex-1">{s.titulo}</span>}
                {(contadores[s.href]?.n ?? 0) > 0 &&
                  (colapsado ? (
                    <span className="zq-contador" aria-hidden="true">
                      {contadores[s.href].n > 9 ? "9+" : contadores[s.href].n}
                    </span>
                  ) : (
                    <span
                      className="zq-num rounded-full bg-sidebar-accent px-2 text-xs leading-5 font-semibold text-sidebar-foreground"
                      aria-label={`${contadores[s.href].n} ${contadores[s.href].etiqueta}`}
                    >
                      {contadores[s.href].n}
                    </span>
                  ))}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-3 border-t border-sidebar-border pt-3">
        <SelectorTema compacto={colapsado} />
        <UserMenu nombre={nombre} email={email} compacto={colapsado} />
      </div>
    </aside>
  )
}

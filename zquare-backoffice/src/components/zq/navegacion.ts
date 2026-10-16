import {
  CalendarClockIcon,
  FileTextIcon,
  FolderKanbanIcon,
  HomeIcon,
  KanbanIcon,
  LightbulbIcon,
  ScrollTextIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"

// El menú agrupado por en qué estás pensando cuando entrás, no por qué tabla
// lee cada pantalla. "Desarrollo" va primero porque es el día a día. Inicio
// queda suelto arriba, sin título de grupo, porque no pertenece a ninguno.
// Lo usan el sidebar de escritorio y el menú de celular.
export type SeccionNav = { titulo: string; href: string; icono: LucideIcon }

export const GRUPOS_NAV: { label: string | null; secciones: SeccionNav[] }[] = [
  {
    label: null,
    secciones: [{ titulo: "Inicio", href: "/", icono: HomeIcon }],
  },
  {
    label: "Desarrollo",
    secciones: [
      { titulo: "Proyectos", href: "/proyectos", icono: FolderKanbanIcon },
      { titulo: "Tareas", href: "/tareas", icono: KanbanIcon },
      { titulo: "Ideas", href: "/ideas", icono: LightbulbIcon },
    ],
  },
  {
    label: "Gestión",
    secciones: [
      { titulo: "Clientes", href: "/clientes", icono: UsersIcon },
      { titulo: "Reuniones", href: "/reuniones", icono: CalendarClockIcon },
      { titulo: "Documentos", href: "/documentos", icono: FileTextIcon },
      { titulo: "Finanzas", href: "/finanzas", icono: WalletIcon },
      { titulo: "Decisiones", href: "/decisiones", icono: ScrollTextIcon },
    ],
  },
]

// Cookie con el estado del sidebar de escritorio ("colapsado" o "expandido").
// Vive acá y no en app-sidebar porque el layout (servidor) la lee, y lo que se
// exporta de un módulo "use client" no llega al servidor como valor.
export const COOKIE_SIDEBAR = "zq-sidebar"

export function seccionActiva(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)
}

// Título de la barra de celular: la sección en la que estás. Presupuestos
// cuelga de Clientes.
export function tituloSeccion(pathname: string): string {
  for (const grupo of GRUPOS_NAV) {
    for (const s of grupo.secciones) {
      if (seccionActiva(s.href, pathname)) return s.titulo
    }
  }
  if (pathname.startsWith("/presupuestos")) return "Presupuestos"
  return "ZQUARE"
}

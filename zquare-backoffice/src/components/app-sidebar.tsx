"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  FileTextIcon,
  FolderKanbanIcon,
  HomeIcon,
  KanbanIcon,
  LightbulbIcon,
  ScrollTextIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react"

import { BusquedaGlobal } from "@/components/busqueda-global"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { UserMenu } from "@/components/user-menu"

// El menú agrupado por en qué estás pensando cuando entrás, no por qué tabla
// lee cada pantalla. "Desarrollo" va primero porque es el día a día: proyectos
// y tareas son lo que se abre todas las mañanas. Inicio queda suelto arriba,
// sin título de grupo, porque no pertenece a ninguno de los dos.
const grupos = [
  {
    label: null,
    secciones: [
      { titulo: "Inicio", href: "/", icono: HomeIcon, disponible: true },
    ],
  },
  {
    label: "Desarrollo",
    secciones: [
      { titulo: "Proyectos", href: "/proyectos", icono: FolderKanbanIcon, disponible: true },
      { titulo: "Tareas", href: "/tareas", icono: KanbanIcon, disponible: true },
      { titulo: "Ideas", href: "/ideas", icono: LightbulbIcon, disponible: true },
    ],
  },
  {
    label: "Gestión",
    secciones: [
      { titulo: "Clientes", href: "/clientes", icono: UsersIcon, disponible: true },
      { titulo: "Documentos", href: "/documentos", icono: FileTextIcon, disponible: true },
      { titulo: "Finanzas", href: "/finanzas", icono: WalletIcon, disponible: true },
      { titulo: "Decisiones", href: "/decisiones", icono: ScrollTextIcon, disponible: true },
    ],
  },
]

export function AppSidebar({ email }: { email: string }) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3 px-4 py-3 group-data-[collapsible=icon]:px-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-lg font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            ZQUARE
          </span>
          <SidebarTrigger className="text-muted-foreground" />
        </div>
        <div className="group-data-[collapsible=icon]:hidden">
          <BusquedaGlobal />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {grupos.map((grupo) => (
        <SidebarGroup key={grupo.label ?? "principal"}>
          {grupo.label && <SidebarGroupLabel>{grupo.label}</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {grupo.secciones.map((seccion) => (
                <SidebarMenuItem key={seccion.href}>
                  <SidebarMenuButton
                    isActive={
                      seccion.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(seccion.href)
                    }
                    disabled={!seccion.disponible}
                    render={
                      seccion.disponible ? (
                        <Link href={seccion.href} />
                      ) : (
                        <button type="button" />
                      )
                    }
                  >
                    <seccion.icono />
                    <span>{seccion.titulo}</span>
                  </SidebarMenuButton>
                  {!seccion.disponible && (
                    <SidebarMenuBadge>pronto</SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu email={email} />
      </SidebarFooter>
    </Sidebar>
  )
}

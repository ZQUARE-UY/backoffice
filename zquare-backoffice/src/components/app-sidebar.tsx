"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  FileTextIcon,
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

const secciones = [
  { titulo: "Inicio", href: "/", icono: HomeIcon, disponible: true },
  { titulo: "Clientes", href: "/clientes", icono: UsersIcon, disponible: true },
  { titulo: "Tareas", href: "/tareas", icono: KanbanIcon, disponible: true },
  { titulo: "Ideas", href: "/ideas", icono: LightbulbIcon, disponible: true },
  { titulo: "Decisiones", href: "/decisiones", icono: ScrollTextIcon, disponible: true },
  { titulo: "Documentos", href: "/documentos", icono: FileTextIcon, disponible: true },
  { titulo: "Finanzas", href: "/finanzas", icono: WalletIcon, disponible: true },
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
        <SidebarGroup>
          <SidebarGroupLabel>Gestión</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secciones.map((seccion) => (
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
      </SidebarContent>
      <SidebarFooter>
        <UserMenu email={email} />
      </SidebarFooter>
    </Sidebar>
  )
}

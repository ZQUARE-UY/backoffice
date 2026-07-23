"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  FileTextIcon,
  HomeIcon,
  ScrollTextIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react"

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
} from "@/components/ui/sidebar"
import { UserMenu } from "@/components/user-menu"

const secciones = [
  { titulo: "Inicio", href: "/", icono: HomeIcon, disponible: true },
  { titulo: "Clientes", href: "/clientes", icono: UsersIcon, disponible: true },
  { titulo: "Decisiones", href: "/decisiones", icono: ScrollTextIcon, disponible: true },
  { titulo: "Documentos", href: "/documentos", icono: FileTextIcon, disponible: false },
  { titulo: "Finanzas", href: "/finanzas", icono: WalletIcon, disponible: false },
]

export function AppSidebar({ email }: { email: string }) {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3">
        <span className="text-lg font-semibold tracking-tight">ZQUARE</span>
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

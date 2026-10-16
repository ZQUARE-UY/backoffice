"use client"

import { LogOutIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { iniciales } from "@/lib/formato"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

// El usuario al pie del sidebar (y del menú de celular): avatar con
// iniciales, nombre y mail. Abre un menú con cerrar sesión (el tema va
// aparte, en SelectorTema, justo arriba).
export function UserMenu({
  nombre,
  email,
  className,
  compacto = false,
}: {
  nombre: string
  email: string
  className?: string
  // Sidebar colapsado: solo el avatar.
  compacto?: boolean
}) {
  async function cerrarSesion() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-sidebar-accent",
          compacto && "justify-center px-0",
          className
        )}
        aria-label={`Cuenta de ${nombre}`}
        title={compacto ? nombre : undefined}
      >
        <span className="zq-avatar" aria-hidden="true">
          {iniciales(nombre || email)}
        </span>
        <span className={cn("flex min-w-0 flex-col", compacto && "hidden")}>
          <span className="truncate text-sm leading-5 font-semibold text-sidebar-foreground">
            {nombre}
          </span>
          <span className="truncate text-xs leading-4 text-sidebar-muted">{email}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={cerrarSesion}>
            <LogOutIcon />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

"use client"

import { LogOutIcon } from "lucide-react"
import { useTheme } from "next-themes"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { iniciales } from "@/lib/formato"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

// El usuario al pie del sidebar (y del menú de celular): avatar con
// iniciales, nombre y mail. Abre un menú con el tema y cerrar sesión.
export function UserMenu({
  nombre,
  email,
  className,
}: {
  nombre: string
  email: string
  className?: string
}) {
  const { theme, setTheme } = useTheme()

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
          className
        )}
        aria-label={`Cuenta de ${nombre}`}
      >
        <span className="zq-avatar" aria-hidden="true">
          {iniciales(nombre || email)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm leading-5 font-semibold text-sidebar-foreground">
            {nombre}
          </span>
          <span className="truncate text-xs leading-4 text-sidebar-muted">{email}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Tema</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(String(v))}>
            <DropdownMenuRadioItem value="light">Claro</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Oscuro</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">Como el sistema</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
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

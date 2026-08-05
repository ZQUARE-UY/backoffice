import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { contarPendientes } from "@/lib/reuniones"
import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"

export default async function ProtegidoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const socioId = await idSocioActual()
  const pendientesReuniones = socioId ? await contarPendientes(socioId) : 0

  return (
    <SidebarProvider>
      <AppSidebar
        email={user.email ?? ""}
        pendientesReuniones={pendientesReuniones}
      />
      <SidebarInset>
        <header className="flex h-14 items-center border-b px-4 md:hidden">
          <SidebarTrigger />
        </header>
        <div className="flex flex-1 flex-col gap-6 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

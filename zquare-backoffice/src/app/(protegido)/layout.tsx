import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { CapturaRapida } from "@/components/captura-rapida"
import { Toaster } from "@/components/ui/sonner"
import { BarraMovil, BotonCrear } from "@/components/zq/menu-movil"
import { COOKIE_SIDEBAR } from "@/components/zq/navegacion"
import { notificacionesRecientes } from "@/lib/notificaciones"
import { solicitudesPendientes } from "@/lib/reuniones"
import { socioActual } from "@/lib/socio-actual"
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

  // socioActual y solicitudesPendientes van con `cache`: el dashboard los
  // vuelve a pedir en el mismo request y comparten resultado.
  const socio = await socioActual()
  const [pendientesReuniones, notificaciones, consultasNuevas, chatsNuevos] = await Promise.all([
    socio ? solicitudesPendientes(socio.id).then((s) => s.length) : 0,
    notificacionesRecientes(socio?.id ?? null),
    supabase
      .from("consultas_web")
      .select("id", { count: "exact", head: true })
      .eq("estado", "nueva")
      .is("deleted_at", null)
      .then((r) => r.count ?? 0),
    // Chats de la web sin revisar (los vacíos no cuentan: no aparecen en la lista).
    supabase
      .from("chats_web")
      .select("id", { count: "exact", head: true })
      .eq("estado", "nuevo")
      .gt("turnos", 0)
      .is("deleted_at", null)
      .then((r) => r.count ?? 0),
  ])

  // El sidebar recuerda si lo dejaste colapsado; se lee del lado del servidor
  // para que la página no arranque ancha y después se achique.
  const colapsado = (await cookies()).get(COOKIE_SIDEBAR)?.value === "colapsado"

  const email = user.email ?? ""
  const nombre = socio?.nombre ?? email.split("@")[0]

  return (
    <div className="flex min-h-dvh w-full">
      <AppSidebar
        nombre={nombre}
        email={email}
        notificaciones={notificaciones}
        pendientesReuniones={pendientesReuniones}
        consultasNuevas={consultasNuevas}
        chatsNuevos={chatsNuevos}
        colapsadoInicial={colapsado}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <BarraMovil nombre={nombre} email={email} notificaciones={notificaciones} />
        <main className="zq-contenido">{children}</main>
      </div>
      <BotonCrear />
      {/* Tecla N (o el botón flotante en celular): captura rápida de tareas e
          ideas desde cualquier pantalla. */}
      <CapturaRapida />
      {/* Sin esto los toast (sonner) no se muestran en ninguna pantalla. */}
      <Toaster />
    </div>
  )
}

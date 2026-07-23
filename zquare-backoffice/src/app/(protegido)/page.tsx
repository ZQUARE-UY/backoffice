import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"

const proximosModulos = [
  {
    titulo: "Clientes y documentos",
    detalle: "CRM, proyectos, presupuestos y documentación en Drive.",
    fase: "Fase 1",
  },
  {
    titulo: "Finanzas",
    detalle: "Gastos, ingresos, aportes y balance entre socios.",
    fase: "Fase 2",
  },
  {
    titulo: "Dashboard",
    detalle: "Métricas de facturación, clientes y estado de la empresa.",
    fase: "Fase 3",
  },
]

export default async function InicioPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const nombre =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "socio"

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hola, {nombre}
        </h1>
        <p className="text-muted-foreground">
          El backoffice está en construcción. Esto es lo que viene.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {proximosModulos.map((modulo) => (
          <Card key={modulo.titulo}>
            <CardHeader>
              <CardDescription>{modulo.fase}</CardDescription>
              <CardTitle>{modulo.titulo}</CardTitle>
              <CardDescription>{modulo.detalle}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </>
  )
}

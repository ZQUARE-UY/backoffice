import Link from "next/link"
import { ScrollTextIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { type Cliente, type Decision, type Socio } from "@/lib/dominio"
import { createClient } from "@/lib/supabase/server"

import { DecisionAcciones } from "./decision-acciones"
import { NuevaDecision } from "./nueva-decision"

export const metadata = { title: "Decisiones" }

export default async function DecisionesPage() {
  const supabase = await createClient()

  const [{ data: decisionesData }, { data: sociosData }, { data: clientesData }] =
    await Promise.all([
      supabase
        .from("decisiones")
        .select("*")
        .is("deleted_at", null)
        .order("fecha", { ascending: false }),
      supabase.from("socios").select("id, nombre, email").is("deleted_at", null),
      supabase
        .from("clientes")
        .select("id, nombre")
        .is("deleted_at", null)
        .order("nombre"),
    ])

  const decisiones = (decisionesData ?? []) as Decision[]
  const socios = (sociosData ?? []) as Socio[]
  const clientes = (clientesData ?? []) as Pick<Cliente, "id" | "nombre">[]
  const nombreCliente = new Map(clientes.map((c) => [c.id, c.nombre]))

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Decisiones</h1>
          <p className="text-muted-foreground">
            Bitácora de decisiones de la empresa y de clientes.
          </p>
        </div>
        <NuevaDecision socios={socios} clientes={clientes} />
      </div>

      {decisiones.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScrollTextIcon />
            </EmptyMedia>
            <EmptyTitle>Sin decisiones</EmptyTitle>
            <EmptyDescription>
              Registrá acuerdos importantes para tener memoria compartida entre
              los socios.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {decisiones.map((decision) => (
            <Card key={decision.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold">{decision.titulo}</h2>
                      {decision.cliente_id &&
                        nombreCliente.has(decision.cliente_id) && (
                          <Link
                            href={`/clientes/${decision.cliente_id}`}
                            className="text-sm text-primary hover:underline"
                          >
                            {nombreCliente.get(decision.cliente_id)}
                          </Link>
                        )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {decision.fecha}
                    </span>
                  </div>
                  <DecisionAcciones
                    decision={decision}
                    socios={socios}
                    clientes={clientes}
                  />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {decision.detalle && (
                  <p className="text-sm whitespace-pre-wrap">
                    {decision.detalle}
                  </p>
                )}
                {decision.participantes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {decision.participantes.map((p) => (
                      <Badge key={p} variant="secondary">
                        {p}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

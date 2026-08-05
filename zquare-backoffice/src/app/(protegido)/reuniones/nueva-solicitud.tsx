"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { PlusIcon } from "lucide-react"

import { SelectCampo } from "@/components/select-campo"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { sumarDias } from "@/lib/disponibilidad"
import { DURACIONES_REUNION, type Cliente, type Socio } from "@/lib/dominio"

import { crearSolicitud } from "./actions"

// Abrir la encuesta: se define con quién hay que reunirse y en qué días
// puede caer. Los horarios los ponen después los socios, uno por uno.
export function NuevaSolicitud({
  socios,
  clientes,
  proyectos,
  hoy,
}: {
  socios: Socio[]
  clientes: Pick<Cliente, "id" | "nombre" | "email">[]
  proyectos: { id: string; nombre: string; cliente_id: string | null }[]
  // Viene del server para que el día inicial sea el de Montevideo y no el del
  // navegador de quien mira.
  hoy: string
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clienteId, setClienteId] = useState("")
  const [pendiente, iniciarTransicion] = useTransition()

  const cliente = clientes.find((c) => c.id === clienteId)
  const proyectosDelCliente = proyectos.filter(
    (p) => p.cliente_id === clienteId
  )

  function onSubmit(formData: FormData) {
    setError(null)
    iniciarTransicion(async () => {
      try {
        const id = await crearSolicitud(formData)
        setAbierto(false)
        router.push(`/reuniones/${id}`)
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo crear")
      }
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button>
            <PlusIcon data-icon="inline-start" />
            Nueva reunión
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        {abierto && (
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>Coordinar una reunión</DialogTitle>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="titulo">Título *</FieldLabel>
                <Input
                  id="titulo"
                  name="titulo"
                  required
                  placeholder="Kickoff con el cliente"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="cliente_id">Cliente</FieldLabel>
                <SelectCampo
                  id="cliente_id"
                  name="cliente_id"
                  value={clienteId}
                  onValueChange={setClienteId}
                  opciones={[
                    { valor: "", label: "Sin cliente (reunión interna)" },
                    ...clientes.map((c) => ({ valor: c.id, label: c.nombre })),
                  ]}
                />
              </Field>

              {proyectosDelCliente.length > 0 && (
                <Field>
                  <FieldLabel htmlFor="proyecto_id">
                    Proyecto (opcional)
                  </FieldLabel>
                  <SelectCampo
                    id="proyecto_id"
                    name="proyecto_id"
                    defaultValue=""
                    opciones={[
                      { valor: "", label: "Sin proyecto" },
                      ...proyectosDelCliente.map((p) => ({
                        valor: p.id,
                        label: p.nombre,
                      })),
                    ]}
                  />
                </Field>
              )}

              <Field>
                <FieldLabel htmlFor="duracion_min">Duración</FieldLabel>
                <SelectCampo
                  id="duracion_min"
                  name="duracion_min"
                  defaultValue="30"
                  opciones={DURACIONES_REUNION}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="ventana_desde">Desde el día</FieldLabel>
                  <Input
                    id="ventana_desde"
                    name="ventana_desde"
                    type="date"
                    required
                    defaultValue={hoy}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ventana_hasta">Hasta el día</FieldLabel>
                  <Input
                    id="ventana_hasta"
                    name="ventana_hasta"
                    type="date"
                    required
                    defaultValue={sumarDias(hoy, 10)}
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel>Quiénes tienen que estar</FieldLabel>
                <div className="flex flex-wrap gap-4 pt-1">
                  {socios.map((socio) => (
                    <label
                      key={socio.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="socios_requeridos"
                        value={socio.id}
                        defaultChecked
                        className="size-4 accent-primary"
                      />
                      {socio.nombre}
                    </label>
                  ))}
                </div>
              </Field>

              {cliente && (
                <Field>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="invitar_cliente"
                      defaultChecked={Boolean(cliente.email)}
                      disabled={!cliente.email}
                      className="size-4 accent-primary"
                    />
                    {cliente.email
                      ? `Invitar a ${cliente.email} al evento`
                      : `${cliente.nombre} no tiene email cargado`}
                  </label>
                </Field>
              )}

              <Field>
                <FieldLabel htmlFor="notas">Notas (opcional)</FieldLabel>
                <Textarea
                  id="notas"
                  name="notas"
                  rows={2}
                  placeholder="Temario, contexto para los demás"
                />
              </Field>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={pendiente}>
                {pendiente && <Spinner data-icon="inline-start" />}
                Pedir disponibilidad
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

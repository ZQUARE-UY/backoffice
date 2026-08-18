"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, type ReactElement } from "react"
import { PencilIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

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
import {
  DURACIONES_REUNION,
  type Cliente,
  type Socio,
  type SolicitudReunion,
} from "@/lib/dominio"

import { crearSolicitud, editarSolicitud } from "./actions"

type Catalogos = {
  socios: Socio[]
  clientes: Pick<Cliente, "id" | "nombre" | "email">[]
  proyectos: { id: string; nombre: string; cliente_id: string | null }[]
}

// Un mismo formulario para abrir la encuesta y para editarla después: se
// define con quién hay que reunirse y en qué días puede caer. Los horarios
// los ponen después los socios, uno por uno.
export function FormularioSolicitud({
  socios,
  clientes,
  proyectos,
  hoy,
  solicitud,
  trigger,
}: Catalogos & {
  // Viene del server para que el día inicial sea el de Montevideo y no el del
  // navegador de quien mira.
  hoy: string
  // Si viene, el diálogo edita esa solicitud en vez de crear una.
  solicitud?: SolicitudReunion
  trigger: ReactElement
}) {
  const router = useRouter()
  const editando = Boolean(solicitud)
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clienteId, setClienteId] = useState(solicitud?.cliente_id ?? "")
  const [pendiente, iniciarTransicion] = useTransition()

  const cliente = clientes.find((c) => c.id === clienteId)
  const proyectosDelCliente = proyectos.filter(
    (p) => p.cliente_id === clienteId
  )
  const requeridos = new Set(solicitud?.socios_requeridos ?? socios.map((s) => s.id))

  function onSubmit(formData: FormData) {
    setError(null)
    iniciarTransicion(async () => {
      if (solicitud) {
        const resultado = await editarSolicitud(solicitud.id, formData)
        if (!resultado.ok) {
          setError(resultado.error ?? "No se pudo guardar")
          return
        }
        setAbierto(false)
        if (resultado.advertencia) toast.warning(resultado.advertencia)
        else toast.success("Reunión actualizada")
        return
      }
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
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        {abierto && (
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editando ? "Editar la reunión" : "Coordinar una reunión"}
              </DialogTitle>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="titulo">Título *</FieldLabel>
                <Input
                  id="titulo"
                  name="titulo"
                  required
                  defaultValue={solicitud?.titulo ?? ""}
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
                    defaultValue={
                      solicitud?.cliente_id === clienteId
                        ? (solicitud?.proyecto_id ?? "")
                        : ""
                    }
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
                  defaultValue={String(solicitud?.duracion_min ?? 30)}
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
                    defaultValue={solicitud?.ventana_desde ?? hoy}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ventana_hasta">Hasta el día</FieldLabel>
                  <Input
                    id="ventana_hasta"
                    name="ventana_hasta"
                    type="date"
                    required
                    defaultValue={solicitud?.ventana_hasta ?? sumarDias(hoy, 10)}
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
                        defaultChecked={requeridos.has(socio.id)}
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
                      defaultChecked={
                        Boolean(cliente.email) &&
                        (solicitud?.invitar_cliente ?? true)
                      }
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
                  defaultValue={solicitud?.notas ?? ""}
                  placeholder="Temario, contexto para los demás"
                />
              </Field>

              {editando && (
                <p className="text-xs text-muted-foreground">
                  Lo que ya respondieron los socios se conserva. Si achicás los
                  días, las horas que queden afuera se descartan.
                </p>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={pendiente}>
                {pendiente && <Spinner data-icon="inline-start" />}
                {editando ? "Guardar cambios" : "Pedir disponibilidad"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function NuevaSolicitud(props: Catalogos & { hoy: string }) {
  return (
    <FormularioSolicitud
      {...props}
      trigger={
        <Button>
          <PlusIcon data-icon="inline-start" />
          Nueva reunión
        </Button>
      }
    />
  )
}

export function EditarSolicitud(
  props: Catalogos & { hoy: string; solicitud: SolicitudReunion }
) {
  return (
    <FormularioSolicitud
      {...props}
      trigger={
        <Button variant="outline" size="sm">
          <PencilIcon data-icon="inline-start" />
          Editar
        </Button>
      }
    />
  )
}

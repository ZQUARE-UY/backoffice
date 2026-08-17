"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { PencilIcon, PlusIcon } from "lucide-react"

import { SelectCampo } from "@/components/select-campo"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { TIPOS_DOCUMENTO } from "@/lib/dominio"

import { anotarArchivo, quitarAnotacion } from "./actions"
import type {
  FilaDocumento,
  OpcionCliente,
  OpcionProyecto,
} from "./lista-documentos"

// La ficha de un archivo de Drive: tipo, de quién es, fecha y tags. Es
// opcional — el archivo se ve en la lista igual — y por eso el formulario
// arranca con lo que se pudo inferir de la carpeta ya elegido.
export function AnotarArchivo({
  fila,
  clientes,
  proyectos,
}: {
  fila: FilaDocumento
  clientes: OpcionCliente[]
  proyectos: OpcionProyecto[]
}) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()
  const [clienteId, setClienteId] = useState(fila.cliente?.id ?? "")

  function onSubmit(formData: FormData) {
    iniciarTransicion(async () => {
      try {
        await anotarArchivo(formData)
        setAbierto(false)
        toast.success("Ficha guardada.")
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo guardar la ficha."
        )
      }
    })
  }

  function onQuitar() {
    if (!fila.anotacion) return
    iniciarTransicion(async () => {
      try {
        await quitarAnotacion(fila.anotacion!.id)
        setAbierto(false)
        toast.success("Ficha quitada. El archivo sigue en Drive.")
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo quitar la ficha."
        )
      }
    })
  }

  // Solo los proyectos del cliente elegido: un documento no puede ser de un
  // proyecto de otro cliente.
  const proyectosDelCliente = proyectos.filter(
    (p) => !clienteId || p.cliente_id === clienteId
  )

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setAbierto(true)}>
        {fila.anotacion ? (
          <>
            <PencilIcon data-icon="inline-start" />
            Editar
          </>
        ) : (
          <>
            <PlusIcon data-icon="inline-start" />
            Ficha
          </>
        )}
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-lg">
          {abierto && (
            <form action={onSubmit}>
              <input type="hidden" name="drive_file_id" value={fila.fileId} />
              <input type="hidden" name="drive_url" value={fila.url} />
              <DialogHeader>
                <DialogTitle>Ficha del archivo</DialogTitle>
                <DialogDescription>
                  {fila.ruta.join(" / ") || "En la raíz de la unidad"}
                </DialogDescription>
              </DialogHeader>

              <FieldGroup className="py-4">
                <Field>
                  <FieldLabel htmlFor="titulo">Título</FieldLabel>
                  <Input
                    id="titulo"
                    name="titulo"
                    defaultValue={fila.nombre}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="tipo">Tipo</FieldLabel>
                  <SelectCampo
                    id="tipo"
                    name="tipo"
                    defaultValue={fila.anotacion?.tipo ?? "otro"}
                    opciones={Object.entries(TIPOS_DOCUMENTO).map(
                      ([valor, { label }]) => ({ valor, label })
                    )}
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
                      { valor: "", label: "Sin cliente" },
                      ...clientes.map((c) => ({ valor: c.id, label: c.nombre })),
                    ]}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="proyecto_id">Proyecto</FieldLabel>
                  <SelectCampo
                    id="proyecto_id"
                    name="proyecto_id"
                    defaultValue={fila.proyecto?.id ?? ""}
                    opciones={[
                      { valor: "", label: "Sin proyecto" },
                      ...proyectosDelCliente.map((p) => ({
                        valor: p.id,
                        label: p.nombre,
                      })),
                    ]}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="fecha">Fecha del documento</FieldLabel>
                  <Input
                    id="fecha"
                    name="fecha"
                    type="date"
                    defaultValue={
                      fila.anotacion?.fecha ?? fila.modificado.slice(0, 10)
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="tags">Tags</FieldLabel>
                  <Input
                    id="tags"
                    name="tags"
                    placeholder="separados por coma"
                    defaultValue={(fila.anotacion?.tags ?? []).join(", ")}
                  />
                </Field>
              </FieldGroup>

              <DialogFooter className="sm:justify-between">
                {fila.anotacion ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={onQuitar}
                    disabled={pendiente}
                  >
                    Quitar ficha
                  </Button>
                ) : (
                  <span />
                )}
                <Button type="submit" disabled={pendiente}>
                  {pendiente && <Spinner data-icon="inline-start" />}
                  Guardar ficha
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

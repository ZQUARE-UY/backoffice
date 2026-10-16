"use client"

import { useState, useTransition } from "react"
import { PencilIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { TIPOS, type Bloque, type TipoBloque } from "@/lib/contenido-web"

import { actualizarBloque, crearBloque } from "./actions"

// Alta o edición de un servicio, paso o testimonio: los campos en español a
// la izquierda y en inglés a la derecha (en celular, uno abajo del otro).
export function EditorBloque({ tipo, bloque }: { tipo: TipoBloque; bloque?: Bloque }) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()
  const def = TIPOS[tipo]

  function onSubmit(formData: FormData) {
    iniciarTransicion(async () => {
      try {
        if (bloque) await actualizarBloque(bloque.id, tipo, formData)
        else await crearBloque(tipo, formData)
        setAbierto(false)
        toast.success(bloque ? "Cambios guardados" : `Se agregó el ${def.singular}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo guardar")
      }
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          bloque ? (
            <Button variant="ghost" size="sm">
              <PencilIcon data-icon="inline-start" />
              Editar
            </Button>
          ) : (
            <Button variant="outline" size="sm">
              <PlusIcon data-icon="inline-start" />
              Agregar {def.singular}
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-3xl">
        {abierto && (
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>{bloque ? `Editar ${def.singular}` : `Nuevo ${def.singular}`}</DialogTitle>
              <DialogDescription>
                El español es obligatorio. Lo que quede vacío en inglés se muestra en español.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              {def.compartidos && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {def.compartidos.map((c) => (
                    <Field key={c.clave}>
                      <FieldLabel htmlFor={c.clave}>{c.label}</FieldLabel>
                      <Input
                        id={c.clave}
                        name={c.clave}
                        maxLength={c.max}
                        defaultValue={(bloque?.[c.clave as "nombre" | "empresa"] as string | null) ?? ""}
                      />
                    </Field>
                  ))}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {(["es", "en"] as const).map((idioma) => (
                  <div key={idioma} className="flex flex-col gap-4">
                    <p className="zq-rotulo m-0">{idioma === "es" ? "Español" : "Inglés"}</p>
                    {def.campos.map((c, i) => {
                      const id = `${idioma}.${c.clave}`
                      const props = {
                        id,
                        name: id,
                        maxLength: c.max,
                        required: idioma === "es" && i === 0,
                        defaultValue: bloque?.[idioma]?.[c.clave] ?? "",
                      }
                      return (
                        <Field key={id}>
                          <FieldLabel htmlFor={id}>
                            {c.label}
                            {props.required ? " *" : ""}
                          </FieldLabel>
                          {c.largo ? <Textarea rows={4} {...props} /> : <Input {...props} />}
                        </Field>
                      )
                    })}
                  </div>
                ))}
              </div>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={pendiente}>
                {pendiente && <Spinner data-icon="inline-start" />}
                {bloque ? "Guardar cambios" : "Agregar"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

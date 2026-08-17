"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { PencilIcon, SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  BRIEF_PROYECTO,
  CAMPOS_BRIEF_MINIMO,
  CAMPOS_BRIEF_PROYECTO,
  type Proyecto,
} from "@/lib/dominio"

import { actualizarBriefProyecto } from "../actions"
import { urlIterarBrief } from "../chat-claude"

// El brief de arranque en la ficha. Se arma conversando con Claude (prompt
// `comenzar_proyecto`), pero se puede corregir a mano acá sin abrir un chat:
// leer y editar el resultado tiene que ser posible sin depender del MCP.
export function BriefProyecto({ proyecto }: { proyecto: Proyecto }) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function onSubmit(formData: FormData) {
    iniciarTransicion(async () => {
      await actualizarBriefProyecto(proyecto.id, formData)
      setAbierto(false)
    })
  }

  const conContenido = CAMPOS_BRIEF_PROYECTO.filter((campo) => proyecto[campo])

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium">Brief de arranque</h2>
        <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
          <PencilIcon data-icon="inline-start" />
          Editar brief
        </Button>
      </div>

      {conContenido.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Este proyecto todavía no tiene brief. Se arma con Claude al
            comenzarlo, o a mano con &quot;Editar brief&quot;.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {CAMPOS_BRIEF_PROYECTO.map((campo) => {
            const valor = proyecto[campo]
            const esMinimo = CAMPOS_BRIEF_MINIMO.includes(campo)
            // Los campos vacíos que no son del mínimo no ocupan lugar: el
            // brief se lee mejor sin nueve tarjetas medio vacías.
            if (!valor && !esMinimo) return null
            return (
              <Card key={campo}>
                <CardHeader className="flex-row items-center justify-between gap-2">
                  <CardDescription>{BRIEF_PROYECTO[campo].label}</CardDescription>
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    render={
                      <Link
                        href={urlIterarBrief(proyecto.nombre, campo)}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    }
                  >
                    <SparklesIcon data-icon="inline-start" />
                    Trabajarlo
                  </Button>
                </CardHeader>
                <CardContent className="text-sm whitespace-pre-wrap">
                  {valor ?? (
                    <span className="text-muted-foreground">
                      Sin definir — hace falta para comenzar el proyecto.
                    </span>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {abierto && (
            <form action={onSubmit}>
              <DialogHeader>
                <DialogTitle>Brief de arranque</DialogTitle>
                <DialogDescription>
                  Los cuatro primeros son los que hacen falta para que otro
                  agarre el proyecto sin preguntar.
                </DialogDescription>
              </DialogHeader>
              <FieldGroup className="py-4">
                {CAMPOS_BRIEF_PROYECTO.map((campo) => (
                  <Field key={campo}>
                    <FieldLabel htmlFor={campo}>
                      {BRIEF_PROYECTO[campo].label}
                      {CAMPOS_BRIEF_MINIMO.includes(campo) && " *"}
                    </FieldLabel>
                    <Textarea
                      id={campo}
                      name={campo}
                      rows={3}
                      placeholder={BRIEF_PROYECTO[campo].placeholder}
                      defaultValue={proyecto[campo] ?? ""}
                    />
                  </Field>
                ))}
              </FieldGroup>
              <DialogFooter>
                <Button type="submit" disabled={pendiente}>
                  {pendiente && <Spinner data-icon="inline-start" />}
                  Guardar brief
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

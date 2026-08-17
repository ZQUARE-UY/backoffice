"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { CheckIcon, PlayIcon, SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"

import { marcarProyectoComenzado } from "./actions"
import { urlComenzarProyecto } from "./chat-claude"

// El arranque de un proyecto es una conversación, no un formulario: hay que
// leer los documentos, repreguntar y cambiar de rumbo. Por eso el botón no
// corre nada en el servidor — abre Claude con el prompt `comenzar_proyecto`
// precargado, que usa el conector MCP del backoffice y escribe el resultado
// acá. El botón secundario es para los proyectos que ya se arrancaron por
// fuera y solo hace falta registrarlo.
export function ComenzarProyecto({
  id,
  nombre,
  briefListo,
}: {
  id: string
  nombre: string
  briefListo: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function onMarcar() {
    iniciarTransicion(async () => {
      try {
        await marcarProyectoComenzado(id)
        setAbierto(false)
        toast.success(`"${nombre}" quedó marcado como comenzado.`)
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo marcar el arranque."
        )
      }
    })
  }

  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}>
        <PlayIcon data-icon="inline-start" />
        Comenzar
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Comenzar &quot;{nombre}&quot;</DialogTitle>
            <DialogDescription>
              El arranque se hace conversando con Claude, que tiene acceso al
              backoffice por el conector MCP.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2 text-sm">
            <p className="text-muted-foreground">En la conversación, Claude:</p>
            <ul className="flex flex-col gap-1.5 text-muted-foreground">
              {[
                "Lee la ficha del proyecto y busca en sus documentos, presupuestos y decisiones.",
                "Te pregunta solo lo que no encontró: objetivo, alcance, qué queda afuera, stakeholders, stack, accesos, riesgos e hitos.",
                "Deja creadas las tareas de setup, las primeras historias con sus códigos y las decisiones de arranque.",
                "Cierra el arranque: el proyecto pasa a en curso con su fecha de inicio.",
              ].map((paso) => (
                <li key={paso} className="flex gap-2">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>{paso}</span>
                </li>
              ))}
            </ul>
          </div>

          <DialogFooter className="sm:justify-between">
            {briefListo ? (
              <Button variant="ghost" onClick={onMarcar} disabled={pendiente}>
                {pendiente && <Spinner data-icon="inline-start" />}
                Ya lo arrancamos: solo registralo
              </Button>
            ) : (
              <span />
            )}
            <Button
              nativeButton={false}
              render={
                <Link
                  href={urlComenzarProyecto(nombre)}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <SparklesIcon data-icon="inline-start" />
              Arrancar con Claude
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

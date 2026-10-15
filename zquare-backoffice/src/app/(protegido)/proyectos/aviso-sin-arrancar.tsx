"use client"

import { useState } from "react"
import { ArrowRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { ComenzarProyecto } from "./comenzar-proyecto"

type SinArrancar = { id: string; nombre: string; cliente: string; briefListo: boolean }

// Aviso punteado al pie del listado: "N propuestas sin arrancar" +
// "Comenzar con Claude". Con más de una, primero se elige cuál.
export function AvisoSinArrancar({ proyectos }: { proyectos: SinArrancar[] }) {
  const [elegido, setElegido] = useState<SinArrancar | null>(null)
  const n = proyectos.length

  const contenido = (
    <>
      Comenzar con Claude
      <ArrowRightIcon data-icon="inline-end" />
    </>
  )

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-input px-5 py-4">
      <p className="m-0">
        <strong>
          {n} {n === 1 ? "proyecto sin arrancar." : "proyectos sin arrancar."}
        </strong>{" "}
        <span className="text-muted-foreground">
          Claude lee los documentos, entrevista y deja creadas las tareas iniciales.
        </span>
      </p>
      {n === 1 ? (
        <Button size="sm" onClick={() => setElegido(proyectos[0])}>
          {contenido}
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm">{contenido}</Button>} />
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>¿Cuál arrancamos?</DropdownMenuLabel>
              {proyectos.map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => setElegido(p)}>
                  <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                  <span className="text-xs text-muted-foreground">{p.cliente}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {elegido && (
        <ComenzarProyecto
          key={elegido.id}
          id={elegido.id}
          nombre={elegido.nombre}
          briefListo={elegido.briefListo}
          sinBoton
          abierto
          onAbiertoChange={(v) => !v && setElegido(null)}
        />
      )}
    </div>
  )
}

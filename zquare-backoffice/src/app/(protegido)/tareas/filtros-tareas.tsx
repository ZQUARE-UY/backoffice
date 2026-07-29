"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { XIcon } from "lucide-react"

import { SelectCampo } from "@/components/select-campo"
import { Button } from "@/components/ui/button"
import { type Socio } from "@/lib/dominio"

import { type ClienteOpcion, type ProyectoOpcion } from "./campos-tarea"

// Los filtros viven en la URL (compartible, sobrevive al refresh) y los lee el
// server component: acá solo se escriben los searchParams.
export function FiltrosTareas({
  clientes,
  proyectos,
  socios,
}: {
  clientes: ClienteOpcion[]
  proyectos: ProyectoOpcion[]
  socios: Socio[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const cliente = searchParams.get("cliente") ?? ""
  const proyecto = searchParams.get("proyecto") ?? ""
  const socio = searchParams.get("socio") ?? ""
  const hayFiltros = Boolean(cliente || proyecto || socio)

  // `replace` y no `push`: cambiar un filtro no debe apilar historial.
  function setear(cambios: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams)
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor) params.set(clave, valor)
      else params.delete(clave)
    }
    params.delete("tarea")
    const qs = params.toString()
    router.replace(`/tareas${qs ? `?${qs}` : ""}`, { scroll: false })
  }

  const proyectosVisibles = cliente
    ? proyectos.filter((p) => p.cliente_id === cliente)
    : proyectos

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SelectCampo
        name="filtro_cliente"
        value={cliente}
        triggerClassName="w-44"
        opciones={[
          { valor: "", label: "Todos los clientes" },
          ...clientes.map((c) => ({ valor: c.id, label: c.nombre })),
        ]}
        onValueChange={(valor) => {
          // Cambiar de cliente invalida el proyecto elegido si no es suyo.
          const proyectoSigue =
            proyecto &&
            proyectos.some((p) => p.id === proyecto && p.cliente_id === valor)
          setear({ cliente: valor || null, proyecto: proyectoSigue ? proyecto : null })
        }}
      />
      <SelectCampo
        name="filtro_proyecto"
        value={proyecto}
        triggerClassName="w-52"
        opciones={[
          { valor: "", label: "Todos los proyectos" },
          ...proyectosVisibles.map((p) => ({
            valor: p.id,
            label: cliente ? p.nombre : `${p.cliente} — ${p.nombre}`,
          })),
        ]}
        onValueChange={(valor) => {
          // Elegir un proyecto sin cliente seleccionado completa el cliente,
          // para que la URL quede coherente con la cascada.
          const delProyecto = proyectos.find((p) => p.id === valor)?.cliente_id
          setear({ proyecto: valor || null, cliente: cliente || delProyecto || null })
        }}
      />
      <SelectCampo
        name="filtro_socio"
        value={socio}
        triggerClassName="w-44"
        opciones={[
          { valor: "", label: "Cualquier responsable" },
          ...socios.map((s) => ({ valor: s.id, label: s.nombre })),
        ]}
        onValueChange={(valor) => setear({ socio: valor || null })}
      />
      {hayFiltros && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setear({ cliente: null, proyecto: null, socio: null })}
        >
          <XIcon data-icon="inline-start" />
          Limpiar
        </Button>
      )}
    </div>
  )
}

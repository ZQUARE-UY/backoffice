"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { XIcon } from "lucide-react"

import { SelectCampo } from "@/components/select-campo"
import { Button } from "@/components/ui/button"
import {
  ESTADOS_PROYECTO,
  ESTADOS_PROYECTO_ORDEN,
  SALUD_PROYECTO,
  TIPOS_PROYECTO,
  TIPOS_PROYECTO_ORDEN,
  type Socio,
} from "@/lib/dominio"

// Mismo criterio que los filtros del tablero: viven en la URL (compartible,
// sobrevive al refresh) y los lee el server component.
const FILTROS = ["estado", "cliente", "responsable", "tipo", "salud", "arranque"] as const

export function FiltrosProyectos({
  clientes,
  socios,
}: {
  clientes: { id: string; nombre: string }[]
  socios: Socio[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const valor = (clave: string) => searchParams.get(clave) ?? ""
  const hayFiltros = FILTROS.some((f) => valor(f))

  // `replace` y no `push`: cambiar un filtro no debe apilar historial.
  function setear(cambios: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams)
    for (const [clave, v] of Object.entries(cambios)) {
      if (v) params.set(clave, v)
      else params.delete(clave)
    }
    const qs = params.toString()
    router.replace(`/proyectos${qs ? `?${qs}` : ""}`, { scroll: false })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SelectCampo
        name="filtro_estado"
        value={valor("estado")}
        triggerClassName="w-40"
        opciones={[
          { valor: "", label: "Todos los estados" },
          ...ESTADOS_PROYECTO_ORDEN.map((e) => ({
            valor: e,
            label: ESTADOS_PROYECTO[e].label,
          })),
        ]}
        onValueChange={(v) => setear({ estado: v || null })}
      />
      <SelectCampo
        name="filtro_cliente"
        value={valor("cliente")}
        triggerClassName="w-44"
        opciones={[
          { valor: "", label: "Todos los clientes" },
          ...clientes.map((c) => ({ valor: c.id, label: c.nombre })),
        ]}
        onValueChange={(v) => setear({ cliente: v || null })}
      />
      <SelectCampo
        name="filtro_responsable"
        value={valor("responsable")}
        triggerClassName="w-44"
        opciones={[
          { valor: "", label: "Cualquier responsable" },
          ...socios.map((s) => ({ valor: s.id, label: s.nombre })),
        ]}
        onValueChange={(v) => setear({ responsable: v || null })}
      />
      <SelectCampo
        name="filtro_tipo"
        value={valor("tipo")}
        triggerClassName="w-44"
        opciones={[
          { valor: "", label: "Todos los tipos" },
          ...TIPOS_PROYECTO_ORDEN.map((t) => ({
            valor: t,
            label: TIPOS_PROYECTO[t].label,
          })),
        ]}
        onValueChange={(v) => setear({ tipo: v || null })}
      />
      <SelectCampo
        name="filtro_salud"
        value={valor("salud")}
        triggerClassName="w-40"
        opciones={[
          { valor: "", label: "Cualquier salud" },
          ...Object.entries(SALUD_PROYECTO).map(([v, info]) => ({
            valor: v,
            label: info.label,
          })),
        ]}
        onValueChange={(v) => setear({ salud: v || null })}
      />
      <SelectCampo
        name="filtro_arranque"
        value={valor("arranque")}
        triggerClassName="w-40"
        opciones={[
          { valor: "", label: "Arrancados o no" },
          { valor: "sin_comenzar", label: "Sin comenzar" },
          { valor: "comenzado", label: "Comenzados" },
        ]}
        onValueChange={(v) => setear({ arranque: v || null })}
      />
      {hayFiltros && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setear(Object.fromEntries(FILTROS.map((f) => [f, null])))
          }
        >
          <XIcon data-icon="inline-start" />
          Limpiar
        </Button>
      )}
    </div>
  )
}

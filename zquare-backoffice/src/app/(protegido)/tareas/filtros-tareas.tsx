"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Popover } from "@base-ui/react/popover"
import { ListFilterIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SelectNativo } from "@/components/zq/campos"
import { type Socio } from "@/lib/dominio"

import { type ClienteOpcion, type ProyectoOpcion } from "./campos-tarea"

// Los filtros viven en la URL (compartible, sobrevive al refresh) y los lee el
// server component: acá solo se escriben los searchParams. Van detrás de un
// botón "Filtros" (con la cantidad de filtros activos) para que el
// encabezado quede con dos acciones.
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
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const cliente = searchParams.get("cliente") ?? ""
  const proyecto = searchParams.get("proyecto") ?? ""
  const socio = searchParams.get("socio") ?? ""
  const activos = [cliente, proyecto, socio].filter(Boolean).length

  // `replace` y no `push`: cambiar un filtro no debe apilar historial.
  function setear(cambios: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams)
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor) params.set(clave, valor)
      else params.delete(clave)
    }
    params.delete("tarea")
    const qs = params.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false })
  }

  const proyectosVisibles = cliente
    ? proyectos.filter((p) => p.cliente_id === cliente)
    : proyectos

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <Button variant="outline">
            <ListFilterIcon data-icon="inline-start" />
            Filtros
            {activos > 0 && (
              <span className="zq-num rounded-full bg-foreground px-1.5 text-[11px] leading-[18px] text-background">
                {activos}
              </span>
            )}
          </Button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-50">
          <Popover.Popup className="flex w-64 flex-col gap-2 rounded-xl border bg-popover p-3 text-popover-foreground shadow-[var(--sombra-flotante)] outline-none">
            <Popover.Title className="zq-rotulo">Filtrar tareas</Popover.Title>
            {/* Selects nativos: los de base-ui no abren dentro de otro
                desplegable flotante. */}
            <SelectNativo
              aria-label="Cliente"
              value={cliente}
              onChange={(e) => {
                const valor = e.target.value
                // Cambiar de cliente invalida el proyecto elegido si no es suyo.
                const proyectoSigue =
                  proyecto &&
                  proyectos.some((p) => p.id === proyecto && p.cliente_id === valor)
                setear({ cliente: valor || null, proyecto: proyectoSigue ? proyecto : null })
              }}
            >
              <option value="">Todos los clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </SelectNativo>
            <SelectNativo
              aria-label="Proyecto"
              value={proyecto}
              onChange={(e) => {
                const valor = e.target.value
                // Elegir un proyecto sin cliente seleccionado completa el
                // cliente, para que la URL quede coherente con la cascada.
                const delProyecto = proyectos.find((p) => p.id === valor)?.cliente_id
                setear({ proyecto: valor || null, cliente: cliente || delProyecto || null })
              }}
            >
              <option value="">Todos los proyectos</option>
              {proyectosVisibles.map((p) => (
                <option key={p.id} value={p.id}>
                  {cliente ? p.nombre : `${p.cliente} · ${p.nombre}`}
                </option>
              ))}
            </SelectNativo>
            <SelectNativo
              aria-label="Responsable"
              value={socio}
              onChange={(e) => setear({ socio: e.target.value || null })}
            >
              <option value="">Cualquier responsable</option>
              {socios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </SelectNativo>
            {activos > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setear({ cliente: null, proyecto: null, socio: null })}
              >
                <XIcon data-icon="inline-start" />
                Limpiar
              </Button>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

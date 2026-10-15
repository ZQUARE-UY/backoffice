"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { SelectNativo } from "@/components/zq/campos"
import { ESTADOS_PROYECTO, ESTADOS_PROYECTO_ORDEN, type Socio } from "@/lib/dominio"

// Filtros del encabezado: estado, cliente y responsable. Mismo criterio que
// los del tablero: viven en la URL (compartible, sobrevive al refresh) y los
// lee el server component. Tipo, salud y arranque siguen andando por URL
// (?tipo=, ?salud=, ?arranque=) aunque no tengan control acá.
export function FiltrosProyectos({
  clientes,
  socios,
}: {
  clientes: { id: string; nombre: string }[]
  socios: Socio[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const valor = (clave: string) => searchParams.get(clave) ?? ""

  // `replace` y no `push`: cambiar un filtro no debe apilar historial.
  function setear(clave: string, v: string) {
    const params = new URLSearchParams(searchParams)
    if (v) params.set(clave, v)
    else params.delete(clave)
    const qs = params.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false })
  }

  return (
    <>
      <SelectNativo aria-label="Estado" value={valor("estado")} onChange={(e) => setear("estado", e.target.value)}>
        <option value="">Todos los estados</option>
        {ESTADOS_PROYECTO_ORDEN.map((e) => (
          <option key={e} value={e}>
            {ESTADOS_PROYECTO[e].label}
          </option>
        ))}
      </SelectNativo>
      <SelectNativo aria-label="Cliente" value={valor("cliente")} onChange={(e) => setear("cliente", e.target.value)}>
        <option value="">Todos los clientes</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </SelectNativo>
      <SelectNativo
        aria-label="Responsable"
        value={valor("responsable")}
        onChange={(e) => setear("responsable", e.target.value)}
      >
        <option value="">Cualquier responsable</option>
        {socios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </SelectNativo>
    </>
  )
}

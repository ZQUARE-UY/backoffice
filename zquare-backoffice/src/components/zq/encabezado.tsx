import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"

import { Pildoras, type Pestana } from "@/components/zq/pildoras"
import { cn } from "@/lib/utils"

// Encabezado de página (.zq-encabezado): título display de 32/38 sobre el
// fondo, sin banda de color, con un filete abajo y las acciones a la derecha
// (un solo primario).
//
// - `pestanas`: vistas de la pantalla como píldoras al lado del título
//   (Tablero · Backlog · Calendario), cada una un link a su ruta.
// - `volverA`: fichas (un proyecto). Botón cuadrado "←" a la izquierda del
//   título que vuelve al listado. Nunca migas de pan.
// - `rotulo`: texto chico en mayúsculas arriba del título
//   ("IBER · DESARROLLO A MEDIDA").
export function Encabezado({
  titulo,
  rotulo,
  volverA,
  pestanas,
  acciones,
  className,
}: {
  titulo: React.ReactNode
  rotulo?: React.ReactNode
  volverA?: { href: string; label: string }
  pestanas?: Pestana[]
  acciones?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn("zq-encabezado", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex min-w-0 items-center gap-3.5">
          {volverA && (
            <Link href={volverA.href} className="zq-volver" aria-label={volverA.label}>
              <ArrowLeftIcon className="size-[18px]" aria-hidden="true" />
            </Link>
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            {rotulo && <p className="zq-rotulo">{rotulo}</p>}
            <h1 className="zq-encabezado-titulo">{titulo}</h1>
          </div>
        </div>
        {pestanas && <Pildoras pestanas={pestanas} />}
      </div>
      {acciones && <div className="zq-encabezado-acciones">{acciones}</div>}
    </header>
  )
}

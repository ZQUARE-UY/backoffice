import Link from "next/link"

import { cn } from "@/lib/utils"

// Pestañas subrayadas de una ficha (Resumen · Tareas · N · …). Son links
// (`?tab=`): la pestaña se puede compartir y el server trae lo que muestra.
export function Pestanas({
  pestanas,
  activa,
  label,
}: {
  pestanas: { clave: string; texto: string; href: string }[]
  activa: string
  label: string
}) {
  return (
    <nav aria-label={label} className="flex gap-6 overflow-x-auto border-b">
      {pestanas.map((p) => {
        const on = p.clave === activa
        return (
          <Link
            key={p.clave}
            href={p.href}
            scroll={false}
            aria-current={on ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-0.5 py-2.5 whitespace-nowrap no-underline",
              on
                ? "border-foreground font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {p.texto}
          </Link>
        )
      })}
    </nav>
  )
}

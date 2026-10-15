"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export type Pestana = { href: string; label: string }

// Pestañas tipo píldora: links a rutas distintas, la activa en tinta.
// Activa = la ruta exacta, sin la query (así /tareas no queda prendida en
// /tareas/backlog, y los filtros en la URL no la apagan).
export function Pildoras({ pestanas, label = "Vistas" }: { pestanas: Pestana[]; label?: string }) {
  const pathname = usePathname()
  return (
    <nav className="zq-pildoras" aria-label={label}>
      {pestanas.map((p) => (
        <Link key={p.href} href={p.href} aria-current={pathname === p.href.split("?")[0] ? "page" : undefined}>
          {p.label}
        </Link>
      ))}
    </nav>
  )
}

"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export type Pestana = { href: string; label: string }

// Pestañas tipo píldora: links a rutas distintas, la activa en tinta.
// Activa = la ruta exacta (así /tareas no queda prendida en /tareas/backlog).
export function Pildoras({ pestanas, label = "Vistas" }: { pestanas: Pestana[]; label?: string }) {
  const pathname = usePathname()
  return (
    <nav className="zq-pildoras" aria-label={label}>
      {pestanas.map((p) => (
        <Link key={p.href} href={p.href} aria-current={pathname === p.href ? "page" : undefined}>
          {p.label}
        </Link>
      ))}
    </nav>
  )
}

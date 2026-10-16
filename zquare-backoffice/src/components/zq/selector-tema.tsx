"use client"

import { useSyncExternalStore } from "react"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { cn } from "@/lib/utils"

const TEMAS = [
  { valor: "light", titulo: "Claro", icono: SunIcon },
  { valor: "dark", titulo: "Oscuro", icono: MoonIcon },
  { valor: "system", titulo: "Como el sistema", icono: MonitorIcon },
] as const

// El tema solo se conoce en el navegador; hasta montar no marcamos ninguno
// para que el HTML del servidor coincida.
const sinSuscripcion = () => () => {}

// Claro / oscuro / sistema, arriba del usuario en el sidebar y en el menú de
// celular. Compacto (sidebar colapsado): un solo botón que va rotando.
export function SelectorTema({ compacto = false }: { compacto?: boolean }) {
  const { theme, setTheme } = useTheme()
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false)
  const actual = montado ? theme : undefined

  if (compacto) {
    const i = TEMAS.findIndex((t) => t.valor === actual)
    const tema = TEMAS[i === -1 ? 2 : i]
    const siguiente = TEMAS[(TEMAS.indexOf(tema) + 1) % TEMAS.length]
    return (
      <button
        type="button"
        onClick={() => setTheme(siguiente.valor)}
        className="flex h-9 w-full cursor-pointer items-center justify-center rounded-lg text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
        aria-label={`Tema: ${tema.titulo}. Cambiar a ${siguiente.titulo.toLowerCase()}`}
        title={`Tema: ${tema.titulo}`}
      >
        <tema.icono className="size-4" aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 px-2 pb-2">
      <span className="text-xs font-semibold text-sidebar-muted">Tema</span>
      <div role="radiogroup" aria-label="Tema" className="flex gap-0.5 rounded-lg bg-sidebar-accent p-0.5">
        {TEMAS.map((t) => (
          <button
            key={t.valor}
            type="button"
            role="radio"
            aria-checked={actual === t.valor}
            aria-label={t.titulo}
            title={t.titulo}
            onClick={() => setTheme(t.valor)}
            className={cn(
              "inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-sidebar-muted hover:text-sidebar-foreground",
              actual === t.valor && "bg-sidebar text-sidebar-foreground"
            )}
          >
            <t.icono className="size-3.5" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  )
}

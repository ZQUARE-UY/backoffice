"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  FileTextIcon,
  FolderIcon,
  SearchIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react"

import {
  buscar,
  buscarContenido,
  type ResultadoBusqueda,
} from "@/app/(protegido)/busqueda-actions"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

const ICONOS = {
  cliente: UsersIcon,
  proyecto: FolderIcon,
  documento: FileTextIcon,
  contenido: SparklesIcon,
}

const GRUPOS: { kind: ResultadoBusqueda["kind"]; label: string }[] = [
  { kind: "cliente", label: "Clientes" },
  { kind: "proyecto", label: "Proyectos" },
  { kind: "documento", label: "Documentos" },
  { kind: "contenido", label: "Contenido (semántico)" },
]

export function BusquedaGlobal() {
  const [abierto, setAbierto] = useState(false)
  const [query, setQuery] = useState("")
  const [resultados, setResultados] = useState<ResultadoBusqueda[]>([])
  const [, iniciarTransicion] = useTransition()
  const router = useRouter()

  // Atajo Cmd+K / Ctrl+K para abrir.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setAbierto((v) => !v)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  // Búsqueda con debounce. Solo dispara con 2+ caracteres; cuando la query es
  // corta no limpiamos estado acá (lo derivamos en el render con `activo`).
  // La búsqueda literal llega primero; la semántica (más lenta) se agrega
  // cuando responde, salvo que la query haya cambiado en el medio.
  useEffect(() => {
    if (query.trim().length < 2) return
    let cancelada = false
    const t = setTimeout(() => {
      iniciarTransicion(async () => {
        const literales = await buscar(query)
        if (cancelada) return
        setResultados(literales)
        const contenido = await buscarContenido(query)
        if (cancelada || contenido.length === 0) return
        // No duplicar documentos que ya aparecieron en la búsqueda literal.
        const titulos = new Set(literales.map((r) => r.titulo.toLowerCase()))
        setResultados([
          ...literales,
          ...contenido.filter((r) => !titulos.has(r.titulo.toLowerCase())),
        ])
      })
    }, 200)
    return () => {
      cancelada = true
      clearTimeout(t)
    }
  }, [query])

  const activo = query.trim().length >= 2
  const visibles = activo ? resultados : []

  function ir(href: string) {
    setAbierto(false)
    setQuery("")
    setResultados([])
    // Los resultados de contenido de Drive abren el archivo en Drive.
    if (href.startsWith("http")) {
      window.open(href, "_blank", "noopener,noreferrer")
      return
    }
    router.push(href)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        <SearchIcon className="size-4 shrink-0" />
        <span>Buscar…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={abierto} onOpenChange={setAbierto}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar clientes, proyectos, documentos…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {activo && visibles.length === 0 && (
              <CommandEmpty>Sin resultados.</CommandEmpty>
            )}
            {GRUPOS.map((grupo) => {
              const items = visibles.filter((r) => r.kind === grupo.kind)
              if (items.length === 0) return null
              const Icono = ICONOS[grupo.kind]
              return (
                <CommandGroup key={grupo.kind} heading={grupo.label}>
                  {items.map((r) => (
                    <CommandItem
                      key={`${r.kind}-${r.id}`}
                      value={`${r.kind}-${r.id}`}
                      onSelect={() => ir(r.href)}
                    >
                      <Icono className="text-muted-foreground" />
                      <span>{r.titulo}</span>
                      {r.subtitulo && (
                        <span className="text-muted-foreground">
                          · {r.subtitulo}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}

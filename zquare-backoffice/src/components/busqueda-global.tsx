"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileTextIcon, FolderIcon, SearchIcon, UsersIcon } from "lucide-react"

import { buscar, type ResultadoBusqueda } from "@/app/(protegido)/busqueda-actions"
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
}

const GRUPOS: { kind: ResultadoBusqueda["kind"]; label: string }[] = [
  { kind: "cliente", label: "Clientes" },
  { kind: "proyecto", label: "Proyectos" },
  { kind: "documento", label: "Documentos" },
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
  useEffect(() => {
    if (query.trim().length < 2) return
    const t = setTimeout(() => {
      iniciarTransicion(async () => {
        setResultados(await buscar(query))
      })
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  const activo = query.trim().length >= 2
  const visibles = activo ? resultados : []

  function ir(href: string) {
    setAbierto(false)
    setQuery("")
    setResultados([])
    router.push(href)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center gap-2 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        <SearchIcon className="size-4" />
        <span className="hidden sm:inline">Buscar…</span>
        <kbd className="ml-2 hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">
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

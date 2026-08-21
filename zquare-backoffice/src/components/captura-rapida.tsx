"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { CornerDownLeftIcon, KanbanIcon, LightbulbIcon, ZapIcon } from "lucide-react"
import { toast } from "sonner"

import { crearIdea } from "@/app/(protegido)/ideas/actions"
import { crearTarea, proyectosParaCaptura } from "@/app/(protegido)/tareas/actions"
import { SelectCampo } from "@/components/select-campo"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { codigoIdea, codigoTarea } from "@/lib/dominio"
import { cn } from "@/lib/utils"

type Tipo = "tarea" | "idea"

const TIPOS: { valor: Tipo; label: string; icono: typeof KanbanIcon; placeholder: string }[] = [
  {
    valor: "tarea",
    label: "Tarea",
    icono: KanbanIcon,
    placeholder: "Algo chico que hay que hacer, un bug, un pendiente…",
  },
  {
    valor: "idea",
    label: "Idea",
    icono: LightbulbIcon,
    placeholder: "Algo que se te ocurrió y no querés perder…",
  },
]

type Capturada = { tipo: Tipo; codigo: string; titulo: string; href: string }
type Proyecto = { id: string; nombre: string; cliente: string | null; cliente_id: string | null }

// Captura rápida: la tecla N (sin modificadores, fuera de un campo de texto y
// sin otro diálogo abierto) abre una caja mínima para anotar una tarea o una
// idea con una sola línea. Enter guarda y deja la caja abierta para seguir
// anotando; Esc cierra. Lo capturado nace crudo (tarea en el backlog libre,
// idea como semilla) y se desarrolla después desde su ficha o con Claude —
// la idea es registrar en el momento, no completar un formulario.
export function CapturaRapida() {
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<Tipo>("tarea")
  const [texto, setTexto] = useState("")
  const [capturadas, setCapturadas] = useState<Capturada[]>([])
  // Proyecto opcional de la tarea (las ideas no llevan: en una idea,
  // `proyecto_id` significa "graduada a ese proyecto"). null = aún sin cargar.
  const [proyectos, setProyectos] = useState<Proyecto[] | null>(null)
  const [proyectoId, setProyectoId] = useState("")
  const [pendiente, iniciarTransicion] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.isComposing || e.repeat) return
      const objetivo = e.target as HTMLElement | null
      if (
        objetivo &&
        (objetivo.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(objetivo.tagName) ||
          objetivo.closest('[role="dialog"], [role="menu"], [role="listbox"], [cmdk-root]'))
      ) {
        return
      }
      // Otro diálogo abierto (ficha, formulario): no se pisa.
      if (document.querySelector('[data-slot="dialog-content"], [role="alertdialog"]')) return
      e.preventDefault()
      setAbierto(true)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  // Los proyectos se cargan la primera vez que se abre la caja; si falla se
  // sigue sin el select (la captura no depende de él).
  useEffect(() => {
    if (!abierto || proyectos !== null) return
    let cancelado = false
    proyectosParaCaptura()
      .then((p) => {
        if (!cancelado) setProyectos(p)
      })
      .catch(() => {
        if (!cancelado) setProyectos([])
      })
    return () => {
      cancelado = true
    }
  }, [abierto, proyectos])

  function cambiarTipo(nuevo: Tipo) {
    setTipo(nuevo)
    inputRef.current?.focus()
  }

  function guardar() {
    const titulo = texto.trim()
    if (!titulo || pendiente) return
    iniciarTransicion(async () => {
      try {
        const fd = new FormData()
        fd.set("titulo", titulo)
        let nueva: Capturada
        if (tipo === "tarea") {
          fd.set("estado", "backlog")
          fd.set("prioridad", "media")
          const proyecto = proyectos?.find((p) => p.id === proyectoId)
          if (proyecto) {
            fd.set("proyecto_id", proyecto.id)
            if (proyecto.cliente_id) fd.set("cliente_id", proyecto.cliente_id)
          }
          const r = await crearTarea(fd)
          nueva = {
            tipo,
            titulo,
            codigo: codigoTarea(r.numero),
            href: `/tareas?vista=backlog&tarea=${r.numero}`,
          }
        } else {
          fd.set("estado", "semilla")
          const r = await crearIdea(fd)
          nueva = { tipo, titulo, codigo: codigoIdea(r.numero), href: `/ideas/${r.id}` }
        }
        // El proyecto elegido se mantiene: lo típico es anotar varias cosas
        // del mismo proyecto seguidas.
        setCapturadas((c) => [nueva, ...c].slice(0, 5))
        setTexto("")
        inputRef.current?.focus()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo guardar")
      }
    })
  }

  const actual = TIPOS.find((t) => t.valor === tipo)!

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v)
        if (!v) {
          setTexto("")
          setCapturadas([])
          setProyectoId("")
        }
      }}
    >
      <DialogContent className="top-[20%] translate-y-0 sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ZapIcon className="size-4" />
            Captura rápida
          </DialogTitle>
          <DialogDescription>
            Una línea y listo. Después se desarrolla desde su ficha o con Claude.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            guardar()
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex rounded-lg border p-0.5" role="radiogroup" aria-label="Qué anotar">
            {TIPOS.map((t) => (
              <button
                key={t.valor}
                type="button"
                role="radio"
                aria-checked={tipo === t.valor}
                onClick={() => cambiarTipo(t.valor)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  tipo === t.valor ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <t.icono className="size-4" />
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Input
              ref={inputRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                // Tab alterna Tarea/Idea sin sacar el foco del texto.
                if (e.key === "Tab" && !e.shiftKey) {
                  e.preventDefault()
                  cambiarTipo(tipo === "tarea" ? "idea" : "tarea")
                }
              }}
              placeholder={actual.placeholder}
              autoFocus
              disabled={pendiente}
              className="pr-9"
            />
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-muted-foreground">
              {pendiente ? <Spinner className="size-4" /> : <CornerDownLeftIcon className="size-4" />}
            </span>
          </div>
          {tipo === "tarea" && proyectos !== null && proyectos.length > 0 && (
            <SelectCampo
              name="proyecto_captura"
              value={proyectoId}
              onValueChange={setProyectoId}
              opciones={[
                { valor: "", label: "Sin proyecto (tarea de empresa)" },
                ...proyectos.map((p) => ({
                  valor: p.id,
                  label: p.cliente ? `${p.cliente} — ${p.nombre}` : p.nombre,
                })),
              ]}
            />
          )}
          <p className="text-xs text-muted-foreground">
            <kbd className="rounded border px-1 font-mono">Enter</kbd> guarda y seguís
            anotando · <kbd className="rounded border px-1 font-mono">Tab</kbd> cambia
            Tarea/Idea · <kbd className="rounded border px-1 font-mono">Esc</kbd> cierra
          </p>
        </form>

        {capturadas.length > 0 && (
          <ul className="flex flex-col gap-1 border-t pt-3 text-sm">
            {capturadas.map((c) => (
              <li key={c.codigo} className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{c.codigo}</span>
                <span className="truncate">{c.titulo}</span>
                <Link
                  href={c.href}
                  onClick={() => setAbierto(false)}
                  className="ml-auto shrink-0 text-xs underline underline-offset-2 hover:text-foreground"
                >
                  Ver
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

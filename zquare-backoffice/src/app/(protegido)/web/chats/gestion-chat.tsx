"use client"

import { useState, useTransition } from "react"
import { XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

import { guardarGestionChat } from "./actions"

// Notas y etiquetas de los socios sobre una conversación. Las etiquetas que ya
// se usaron en otros chats se sugieren al escribir.
export function GestionChat({
  chatId,
  notas: notasIniciales,
  etiquetas: etiquetasIniciales,
  sugeridas,
}: {
  chatId: string
  notas: string | null
  etiquetas: string[]
  sugeridas: string[]
}) {
  const [notas, setNotas] = useState(notasIniciales ?? "")
  const [etiquetas, setEtiquetas] = useState(etiquetasIniciales)
  const [nueva, setNueva] = useState("")
  const [pendiente, iniciarTransicion] = useTransition()

  const cambiado = notas !== (notasIniciales ?? "") || etiquetas.join("|") !== etiquetasIniciales.join("|")
  const agregar = () => {
    const e = nueva.trim().toLowerCase()
    if (e && !etiquetas.includes(e)) setEtiquetas([...etiquetas, e])
    setNueva("")
  }
  const guardar = () =>
    iniciarTransicion(async () => {
      try {
        await guardarGestionChat(chatId, { notas, etiquetas })
        toast.success("Guardado")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo guardar")
      }
    })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {etiquetas.map((e) => (
          <span key={e} className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2.5 text-xs font-semibold">
            {e}
            <button
              type="button"
              aria-label={`Sacar la etiqueta ${e}`}
              onClick={() => setEtiquetas(etiquetas.filter((x) => x !== e))}
              className="inline-flex size-5 items-center justify-center rounded-full hover:bg-background"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <Input
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault()
              agregar()
            }
          }}
          onBlur={agregar}
          list={`etiquetas-${chatId}`}
          placeholder="Agregar etiqueta"
          aria-label="Agregar etiqueta"
          maxLength={40}
          className="h-8 w-40"
        />
        <datalist id={`etiquetas-${chatId}`}>
          {sugeridas
            .filter((s) => !etiquetas.includes(s))
            .map((s) => (
              <option key={s} value={s} />
            ))}
        </datalist>
      </div>
      <Textarea
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        placeholder="Notas del equipo sobre esta conversación"
        aria-label="Notas"
        rows={3}
        maxLength={5000}
      />
      {cambiado && (
        <Button size="sm" onClick={guardar} disabled={pendiente} className="self-start">
          {pendiente && <Spinner data-icon="inline-start" />}
          Guardar notas y etiquetas
        </Button>
      )}
    </div>
  )
}

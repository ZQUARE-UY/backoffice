"use client"

import { useTransition } from "react"
import { SendIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { type ComentarioIdea } from "@/lib/dominio"

import { comentarIdea } from "../actions"

export function ComentariosIdea({
  ideaId,
  comentarios,
}: {
  ideaId: string
  comentarios: ComentarioIdea[]
}) {
  const [pendiente, iniciarTransicion] = useTransition()

  function onComentar(formData: FormData) {
    iniciarTransicion(async () => {
      await comentarIdea(ideaId, formData)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium">
        Comentarios{comentarios.length > 0 && ` (${comentarios.length})`}
      </span>
      {comentarios.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin comentarios todavía.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {comentarios.map((c) => (
            <div key={c.id} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.autor}</span>
                {c.created_at.slice(0, 10)}
              </div>
              <p className="text-sm whitespace-pre-wrap">{c.cuerpo}</p>
            </div>
          ))}
        </div>
      )}
      <form action={onComentar} className="flex flex-col items-end gap-2">
        <Textarea
          name="cuerpo"
          rows={2}
          required
          placeholder="Escribir un comentario"
        />
        <Button type="submit" size="sm" variant="outline" disabled={pendiente}>
          {pendiente ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <SendIcon data-icon="inline-start" />
          )}
          Comentar
        </Button>
      </form>
    </div>
  )
}

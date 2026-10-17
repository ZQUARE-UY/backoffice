"use client"

import { useState, useTransition } from "react"
import { SettingsIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { LIMITES, MAX_INFO, MAX_SALUDO, type ConfigChat } from "@/lib/chat-web-config"

import { guardarConfigChat } from "./actions"

const SALUDO_WEB = {
  es: "¡Hola! Soy el asistente de Zquare. Contame qué querés construir o preguntame por nuestros servicios.",
  en: "Hi! I'm Zquare's assistant. Tell me what you want to build or ask me about our services.",
}

// Botón "Configurar" de Web → Chats y su diálogo: prender/apagar el chat, el
// saludo, lo que el bot sabe además de la web y los límites.
export function ConfigurarChat({ config, configurado }: { config: ConfigChat; configurado: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const [borrador, setBorrador] = useState(config)
  const [pendiente, iniciarTransicion] = useTransition()

  const abrir = () => {
    setBorrador(config)
    setAbierto(true)
  }
  const guardar = () =>
    iniciarTransicion(async () => {
      try {
        await guardarConfigChat(borrador)
        toast.success("Configuración del chat guardada")
        setAbierto(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo guardar")
      }
    })

  return (
    <>
      <Button variant="outline" size="sm" onClick={abrir}>
        <SettingsIcon data-icon="inline-start" />
        Configurar
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              guardar()
            }}
            className="flex flex-col gap-6"
          >
            <DialogHeader>
              <DialogTitle>Chat de la web</DialogTitle>
              <DialogDescription>Los cambios se ven en zquare.uy en hasta un minuto.</DialogDescription>
            </DialogHeader>

            <FieldGroup>
              <Field orientation="horizontal">
                <Checkbox
                  id="chat-activo"
                  checked={borrador.activo}
                  onCheckedChange={(v) => setBorrador({ ...borrador, activo: v === true })}
                />
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor="chat-activo">Chat prendido</FieldLabel>
                  <FieldDescription>
                    Apagado, la web no muestra el chat y el personaje queda como decoración.
                    {!configurado && " Ojo: falta ANTHROPIC_API_KEY en el servidor, así que hoy no anda aunque esté prendido."}
                  </FieldDescription>
                </div>
              </Field>

              {(["es", "en"] as const).map((idioma) => (
                <Field key={idioma}>
                  <FieldLabel htmlFor={`chat-saludo-${idioma}`}>Saludo {idioma === "es" ? "en español" : "en inglés"}</FieldLabel>
                  <Textarea
                    id={`chat-saludo-${idioma}`}
                    rows={2}
                    maxLength={MAX_SALUDO}
                    placeholder={SALUDO_WEB[idioma]}
                    value={borrador.saludo[idioma]}
                    onChange={(e) => setBorrador({ ...borrador, saludo: { ...borrador.saludo, [idioma]: e.target.value } })}
                  />
                  {idioma === "es" && <FieldDescription>El primer mensaje al abrir el chat. Vacío, queda el de la web.</FieldDescription>}
                </Field>
              ))}

              <Field>
                <FieldLabel htmlFor="chat-info">Lo que el bot sabe además de la web</FieldLabel>
                <Textarea
                  id="chat-info"
                  rows={8}
                  maxLength={MAX_INFO}
                  placeholder={"Preguntas frecuentes, qué no hacemos, tecnologías que usamos, casos que se pueden mencionar…\n\nEj.: No hacemos mantenimiento de sitios WordPress."}
                  value={borrador.info}
                  onChange={(e) => setBorrador({ ...borrador, info: e.target.value })}
                />
                <FieldDescription>
                  Se suma al contenido publicado en Web → Contenido. Lo que esté acá lo puede contar a cualquiera: nada
                  confidencial. {borrador.info.length}/{MAX_INFO}
                </FieldDescription>
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                {(Object.keys(LIMITES) as (keyof ConfigChat["limites"])[]).map((clave) => {
                  const l = LIMITES[clave]
                  return (
                    <Field key={clave}>
                      <FieldLabel htmlFor={`chat-${clave}`}>{l.label}</FieldLabel>
                      <Input
                        id={`chat-${clave}`}
                        type="number"
                        min={l.min}
                        max={l.max}
                        value={borrador.limites[clave]}
                        onChange={(e) =>
                          setBorrador({ ...borrador, limites: { ...borrador.limites, [clave]: Number(e.target.value) } })
                        }
                      />
                      <FieldDescription>{l.nota}</FieldDescription>
                    </Field>
                  )
                })}
              </div>
            </FieldGroup>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendiente}>
                {pendiente && <Spinner data-icon="inline-start" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

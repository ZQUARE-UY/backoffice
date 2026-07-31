"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { PencilIcon, SendIcon } from "lucide-react"

import { BotonEliminar } from "@/components/boton-eliminar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  BRIEF_TAREA,
  briefVacio,
  CAMPOS_BRIEF,
  codigoTarea,
  ESTADOS_TAREA,
  PRIORIDADES_TAREA,
  tareaDesarrollada,
  type ComentarioTarea,
  type Socio,
  type Tarea,
  type VersionTarea,
} from "@/lib/dominio"

import { actualizarTarea, comentarTarea, eliminarTarea } from "./actions"
import {
  CamposTarea,
  type ClienteOpcion,
  type ProyectoOpcion,
} from "./campos-tarea"

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  )
}

export function DetalleTarea({
  tarea,
  comentarios,
  versiones,
  socios,
  clientes,
  proyectos,
  children,
  abiertoInicial,
}: {
  tarea: Tarea
  comentarios: ComentarioTarea[]
  versiones: VersionTarea[]
  socios: Socio[]
  clientes: ClienteOpcion[]
  proyectos: ProyectoOpcion[]
  children: React.ReactNode
  // Deep link `?tarea=ZQ-N`: la tarjeta llega ya abierta desde el server.
  abiertoInicial?: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [abierto, setAbierto] = useState(abiertoInicial ?? false)
  const [editando, setEditando] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()
  const [comentando, iniciarComentario] = useTransition()

  const responsable = socios.find((s) => s.id === tarea.asignado_a)
  const cliente = clientes.find((c) => c.id === tarea.cliente_id)
  const proyecto = proyectos.find((p) => p.id === tarea.proyecto_id)

  function onGuardar(formData: FormData) {
    iniciarTransicion(async () => {
      await actualizarTarea(tarea.id, formData)
      setEditando(false)
    })
  }

  function onComentar(formData: FormData) {
    iniciarComentario(async () => {
      await comentarTarea(tarea.id, formData)
    })
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v)
        if (!v) {
          setEditando(false)
          // Al cerrar se limpia el deep link, para que un refresh no reabra.
          if (searchParams.get("tarea")) {
            const params = new URLSearchParams(searchParams)
            params.delete("tarea")
            const qs = params.toString()
            router.replace(`/tareas${qs ? `?${qs}` : ""}`, { scroll: false })
          }
        }
      }}
    >
      <DialogTrigger
        render={<button type="button" className="w-full cursor-pointer text-left" />}
      >
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">
              {codigoTarea(tarea.numero)}
            </span>
            {tarea.titulo}
          </DialogTitle>
        </DialogHeader>

        {editando ? (
          <form action={onGuardar}>
            <CamposTarea
              tarea={tarea}
              socios={socios}
              clientes={clientes}
              proyectos={proyectos}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditando(false)}
                disabled={pendiente}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pendiente}>
                {pendiente && <Spinner data-icon="inline-start" />}
                Guardar cambios
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Dato label="Columna">
                <Badge variant={ESTADOS_TAREA[tarea.estado].variant}>
                  {ESTADOS_TAREA[tarea.estado].label}
                </Badge>
              </Dato>
              <Dato label="Prioridad">
                <Badge variant={PRIORIDADES_TAREA[tarea.prioridad].variant}>
                  {PRIORIDADES_TAREA[tarea.prioridad].label}
                </Badge>
              </Dato>
              <Dato label="Responsable">{responsable?.nombre ?? "Sin asignar"}</Dato>
              <Dato label="Fecha límite">{tarea.fecha_limite ?? "—"}</Dato>
              <Dato label="Cliente">
                {cliente ? (
                  <Link
                    href={`/clientes/${cliente.id}`}
                    className="text-primary hover:underline"
                  >
                    {cliente.nombre}
                  </Link>
                ) : (
                  "Empresa"
                )}
              </Dato>
              <Dato label="Proyecto">
                {proyecto ? (
                  <Link
                    href={`/proyectos/${proyecto.id}`}
                    className="text-primary hover:underline"
                  >
                    {proyecto.nombre}
                  </Link>
                ) : (
                  "—"
                )}
              </Dato>
            </div>

            {tarea.descripcion && (
              <p className="text-sm whitespace-pre-wrap">{tarea.descripcion}</p>
            )}

            {briefVacio(tarea) ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                El brief está vacío. Pedile a Claude &quot;desarrollá{" "}
                {codigoTarea(tarea.numero)}&quot; desde claude.ai (con el
                conector del backoffice) para completarlo entrevistándote, o
                editá la tarjeta a mano.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {CAMPOS_BRIEF.map((campo) =>
                    tarea[campo] ? (
                      <div
                        key={campo}
                        className={cn(
                          "flex flex-col gap-1 rounded-lg border p-3",
                          campo === "plan" && "sm:col-span-2"
                        )}
                      >
                        <span className="text-xs font-medium text-muted-foreground">
                          {BRIEF_TAREA[campo].label}
                        </span>
                        <p className="text-sm whitespace-pre-wrap">{tarea[campo]}</p>
                      </div>
                    ) : null
                  )}
                </div>
                {/* Brief a medias: el caso típico son las tarjetas que salen de
                    graduar una idea, que nacen con contexto y sin criterios. */}
                {!tareaDesarrollada(tarea) && (
                  <p className="text-sm text-muted-foreground">
                    Falta el resultado esperado, así que todavía no es resoluble.
                    Pedile a Claude &quot;desarrollá {codigoTarea(tarea.numero)}
                    &quot; para completar el brief.
                  </p>
                )}
              </div>
            )}

            {tarea.etiquetas.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tarea.etiquetas.map((e) => (
                  <Badge key={e} variant="secondary">
                    {e}
                  </Badge>
                ))}
              </div>
            )}

            <Separator />

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
                        <span className="font-medium text-foreground">
                          {c.autor}
                        </span>
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
                <Button type="submit" size="sm" variant="outline" disabled={comentando}>
                  {comentando ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <SendIcon data-icon="inline-start" />
                  )}
                  Comentar
                </Button>
              </form>
            </div>

            {versiones.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground select-none">
                  Historial ({versiones.length}{" "}
                  {versiones.length === 1 ? "versión" : "versiones"})
                </summary>
                <div className="flex flex-col gap-1.5 pt-2">
                  {versiones.map((v, i) => (
                    <div
                      key={v.id}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <span className="font-mono">v{versiones.length - i}</span>
                      <span className="text-foreground">{v.autor}</span>
                      <span className="ml-auto">{v.created_at.slice(0, 10)}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <DialogFooter>
              <BotonEliminar
                accion={async () => {
                  await eliminarTarea(tarea.id)
                  setAbierto(false)
                }}
                titulo={`¿Eliminar ${codigoTarea(tarea.numero)}?`}
                descripcion="La tarjeta deja de verse en el tablero. Se puede recuperar desde la base si hiciera falta."
              />
              <Button variant="outline" onClick={() => setEditando(true)}>
                <PencilIcon data-icon="inline-start" />
                Editar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

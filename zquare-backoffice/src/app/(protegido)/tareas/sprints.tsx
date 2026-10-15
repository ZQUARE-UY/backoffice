"use client"

import { useState, useTransition } from "react"
import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { SelectCampo } from "@/components/select-campo"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  codigoSprint,
  type Sprint,
} from "@/lib/dominio"

import {
  actualizarSprint,
  completarSprint,
  crearSprint,
  eliminarSprint,
  iniciarSprint,
} from "./actions"
import { type ProyectoOpcion } from "./campos-tarea"
import { CeremoniasSprint } from "./ceremonias-sprint"
import { type ResumenSprint } from "./resumen"

export { resumirSprint, type ResumenSprint } from "./resumen"

function hoyIso(desplazamientoDias = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + desplazamientoDias)
  return d.toISOString().slice(0, 10)
}

// Errores de negocio de las acciones (ya hay un sprint activo, sprint cerrado)
// se muestran como toast en lugar de reventar la página.
async function conToast(accion: () => Promise<void>): Promise<boolean> {
  try {
    await accion()
    return true
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "No se pudo completar la acción")
    return false
  }
}

function CamposSprint({
  sprint,
  proyectos,
  nombreSugerido,
}: {
  sprint?: Sprint
  proyectos: ProyectoOpcion[]
  nombreSugerido?: string
}) {
  return (
    <FieldGroup className="py-4">
      <Field>
        <FieldLabel htmlFor="nombre">Nombre *</FieldLabel>
        <Input
          id="nombre"
          name="nombre"
          required
          placeholder={nombreSugerido ?? "Sprint 1"}
          defaultValue={sprint?.nombre ?? nombreSugerido ?? ""}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="objetivo">Objetivo</FieldLabel>
        <Textarea
          id="objetivo"
          name="objetivo"
          rows={3}
          placeholder="Qué tiene que ser verdad cuando termine el sprint"
          defaultValue={sprint?.objetivo ?? ""}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="fecha_inicio">Inicio</FieldLabel>
          <Input
            id="fecha_inicio"
            name="fecha_inicio"
            type="date"
            defaultValue={sprint?.fecha_inicio ?? ""}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="fecha_fin">Fin</FieldLabel>
          <Input
            id="fecha_fin"
            name="fecha_fin"
            type="date"
            defaultValue={sprint?.fecha_fin ?? ""}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="proyecto_id">Foco (opcional)</FieldLabel>
        <SelectCampo
          id="proyecto_id"
          name="proyecto_id"
          defaultValue={sprint?.proyecto_id ?? ""}
          opciones={[
            { valor: "", label: "Sprint de la empresa (sin proyecto)" },
            ...proyectos.map((p) => ({
              valor: p.id,
              label: `${p.cliente} — ${p.nombre}`,
            })),
          ]}
        />
      </Field>
    </FieldGroup>
  )
}

export function NuevoSprint({
  proyectos,
  siguienteNumero,
  variante = "boton",
  className,
}: {
  proyectos: ProyectoOpcion[]
  siguienteNumero: number
  variante?: "boton" | "vacio"
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function onSubmit(formData: FormData) {
    iniciarTransicion(async () => {
      if (await conToast(() => crearSprint(formData))) setAbierto(false)
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          variante === "vacio" ? (
            <Button variant="outline" size="sm" className={className}>
              <PlusIcon data-icon="inline-start" />
              Crear el primer sprint
            </Button>
          ) : (
            <Button variant="outline" size="sm" className={className}>
              <PlusIcon data-icon="inline-start" />
              Crear sprint
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-lg">
        {abierto && (
          <form action={onSubmit}>
            <DialogHeader>
              <DialogTitle>Nuevo sprint</DialogTitle>
              <DialogDescription>
                Queda planificado: arrastrá tarjetas del backlog y cuando esté
                armado, inicialo para que entren al tablero.
              </DialogDescription>
            </DialogHeader>
            <CamposSprint
              proyectos={proyectos}
              nombreSugerido={codigoSprint(siguienteNumero)}
            />
            <DialogFooter>
              <Button type="submit" disabled={pendiente}>
                {pendiente && <Spinner data-icon="inline-start" />}
                Crear sprint
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// "Iniciar sprint": sus tarjetas entran a Por hacer. Pide las fechas (con
// las del sprint, o hoy + 14 días, como sugerencia). `bloqueo` explica por
// qué todavía no se puede (otro sprint activo, sprint vacío): el botón queda
// al 45% con aria-disabled y el motivo al lado.
export function IniciarSprint({
  sprint,
  resumen,
  bloqueo,
  className,
}: {
  sprint: Sprint
  resumen: ResumenSprint
  bloqueo?: string | null
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function onIniciar(formData: FormData) {
    iniciarTransicion(async () => {
      if (await conToast(() => iniciarSprint(sprint.id, formData))) {
        setAbierto(false)
        toast.success(`${codigoSprint(sprint.numero)} iniciado: sus tarjetas ya están en el tablero`)
      }
    })
  }

  return (
    <>
      <Button
        aria-disabled={bloqueo ? true : undefined}
        className={cn(bloqueo && "zq-primario-pendiente", className)}
        onClick={() => !bloqueo && setAbierto(true)}
      >
        Iniciar sprint
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-lg">
          {abierto && (
            <form action={onIniciar}>
              <DialogHeader>
                <DialogTitle>Iniciar {codigoSprint(sprint.numero)}</DialogTitle>
                <DialogDescription>
                  {`Sus ${resumen.total} ${resumen.total === 1 ? "tarjeta entra" : "tarjetas entran"} a Por hacer, en el orden que tienen acá.`}
                  {resumen.puntos > 0 && ` Compromiso: ${resumen.puntos} puntos.`}
                </DialogDescription>
              </DialogHeader>
              <FieldGroup className="py-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="fecha_inicio">Inicio</FieldLabel>
                    <Input
                      id="fecha_inicio"
                      name="fecha_inicio"
                      type="date"
                      defaultValue={sprint.fecha_inicio ?? hoyIso()}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="fecha_fin">Fin</FieldLabel>
                    <Input
                      id="fecha_fin"
                      name="fecha_fin"
                      type="date"
                      defaultValue={sprint.fecha_fin ?? hoyIso(14)}
                    />
                  </Field>
                </div>
              </FieldGroup>
              <DialogFooter>
                <Button type="submit" disabled={pendiente}>
                  {pendiente && <Spinner data-icon="inline-start" />}
                  <PlayIcon data-icon="inline-start" />
                  Iniciar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// Menú "⋯" de un sprint: editar, ceremonias y (si está planificado)
// eliminar.
export function MenuSprint({
  sprint,
  proyectos,
  className,
}: {
  sprint: Sprint
  proyectos: ProyectoOpcion[]
  className?: string
}) {
  const [editar, setEditar] = useState(false)
  const [ceremonias, setCeremonias] = useState(false)
  const [eliminar, setEliminar] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function onGuardar(formData: FormData) {
    iniciarTransicion(async () => {
      if (await conToast(() => actualizarSprint(sprint.id, formData))) setEditar(false)
    })
  }
  function onEliminar() {
    iniciarTransicion(async () => {
      if (await conToast(() => eliminarSprint(sprint.id))) setEliminar(false)
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Acciones de ${codigoSprint(sprint.numero)}`}
              className={className}
            >
              <MoreHorizontalIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setEditar(true)}>
              <PencilIcon />
              Editar
            </DropdownMenuItem>
            {sprint.estado !== "cerrado" && (
              <DropdownMenuItem onClick={() => setCeremonias(true)}>
                <CalendarDaysIcon />
                Ceremonias
              </DropdownMenuItem>
            )}
            {sprint.estado === "planificado" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setEliminar(true)}>
                  <Trash2Icon />
                  Eliminar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <CeremoniasSprint sprint={sprint} abierto={ceremonias} onAbiertoChange={setCeremonias} />

      <Dialog open={editar} onOpenChange={setEditar}>
        <DialogContent className="sm:max-w-lg">
          {editar && (
            <form action={onGuardar}>
              <DialogHeader>
                <DialogTitle>Editar {codigoSprint(sprint.numero)}</DialogTitle>
              </DialogHeader>
              <CamposSprint sprint={sprint} proyectos={proyectos} />
              <DialogFooter>
                <Button type="submit" disabled={pendiente}>
                  {pendiente && <Spinner data-icon="inline-start" />}
                  Guardar cambios
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={eliminar} onOpenChange={setEliminar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {codigoSprint(sprint.numero)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sus tarjetas vuelven al backlog. No se borra ninguna tarjeta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendiente}
              onClick={(e) => {
                e.preventDefault()
                onEliminar()
              }}
            >
              {pendiente && <Spinner data-icon="inline-start" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// "Completar sprint": lo hecho queda archivado en el sprint y sale del
// tablero; las pendientes van a otro sprint planificado o al backlog.
export function CompletarSprint({
  sprint,
  resumen,
  sprintsPlanificados,
  variante = "outline",
}: {
  sprint: Sprint
  resumen: ResumenSprint
  sprintsPlanificados: Sprint[]
  variante?: "outline" | "ghost"
}) {
  const [completar, setCompletar] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()
  const pendientes = resumen.total - resumen.hechas
  const otrosPlanificados = sprintsPlanificados.filter((s) => s.id !== sprint.id)

  function onCompletar(formData: FormData) {
    iniciarTransicion(async () => {
      if (await conToast(() => completarSprint(sprint.id, formData))) {
        setCompletar(false)
        toast.success(`${codigoSprint(sprint.numero)} completado. Tablero limpio.`)
      }
    })
  }

  return (
    <>
      <Button size="sm" variant={variante} onClick={() => setCompletar(true)}>
        {variante === "outline" && <CheckCircle2Icon data-icon="inline-start" />}
        Completar sprint
      </Button>
      <Dialog open={completar} onOpenChange={setCompletar}>
        <DialogContent className="sm:max-w-lg">
          {completar && (
            <form action={onCompletar}>
              <DialogHeader>
                <DialogTitle>Completar {codigoSprint(sprint.numero)}</DialogTitle>
                <DialogDescription>
                  {resumen.hechas} {resumen.hechas === 1 ? "tarjeta hecha" : "tarjetas hechas"}
                  {resumen.puntos > 0 && ` (${resumen.puntos_hechos} de ${resumen.puntos} pts)`}
                  {" · "}
                  {pendientes} {pendientes === 1 ? "pendiente" : "pendientes"}. Lo
                  hecho queda archivado en el sprint y sale del tablero.
                </DialogDescription>
              </DialogHeader>
              <FieldGroup className="py-4">
                <Field>
                  <FieldLabel htmlFor="destino">
                    {pendientes > 0
                      ? "Las pendientes van a…"
                      : "No hay pendientes que mover"}
                  </FieldLabel>
                  <SelectCampo
                    id="destino"
                    name="destino"
                    defaultValue={otrosPlanificados[0]?.id ?? "backlog"}
                    opciones={[
                      ...otrosPlanificados.map((s) => ({
                        valor: s.id,
                        label: `${s.nombre} (planificado)`,
                      })),
                      { valor: "backlog", label: "Backlog" },
                    ]}
                  />
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button type="submit" disabled={pendiente}>
                  {pendiente && <Spinner data-icon="inline-start" />}
                  <CheckCircle2Icon data-icon="inline-start" />
                  Completar sprint
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

    </>
  )
}

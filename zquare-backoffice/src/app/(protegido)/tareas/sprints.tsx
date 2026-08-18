"use client"

import { useState, useTransition } from "react"
import {
  CalendarIcon,
  CheckCircle2Icon,
  FlagIcon,
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
import { Badge } from "@/components/ui/badge"
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
  diasRestantesSprint,
  ESTADOS_SPRINT,
  type Sprint,
  type Tarea,
} from "@/lib/dominio"

import {
  actualizarSprint,
  completarSprint,
  crearSprint,
  eliminarSprint,
  iniciarSprint,
} from "./actions"
import { type ProyectoOpcion } from "./campos-tarea"

// Métricas de un sprint calculadas por quien lo renderiza (backlog o tablero),
// a partir de las tarjetas que ya tiene cargadas.
export type ResumenSprint = {
  total: number
  hechas: number
  puntos: number
  puntos_hechos: number
}

export function resumirSprint(tarjetas: Tarea[]): ResumenSprint {
  return tarjetas.reduce<ResumenSprint>(
    (r, t) => ({
      total: r.total + 1,
      hechas: r.hechas + (t.estado === "hecho" ? 1 : 0),
      puntos: r.puntos + (t.estimacion ?? 0),
      puntos_hechos: r.puntos_hechos + (t.estado === "hecho" ? (t.estimacion ?? 0) : 0),
    }),
    { total: 0, hechas: 0, puntos: 0, puntos_hechos: 0 }
  )
}

function fechaCorta(fecha: string): string {
  const [a, m, d] = fecha.split("-")
  return `${d}/${m}/${a.slice(2)}`
}

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
}: {
  proyectos: ProyectoOpcion[]
  siguienteNumero: number
  variante?: "boton" | "vacio"
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
            <Button variant="outline" size="sm">
              <PlusIcon data-icon="inline-start" />
              Crear el primer sprint
            </Button>
          ) : (
            <Button variant="outline" size="sm">
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

// Encabezado de un sprint: nombre, estado, fechas, métricas y acciones. Lo usan
// la sección del backlog y el banner del tablero.
export function EncabezadoSprint({
  sprint,
  resumen,
  sprintsPlanificados,
  proyectos,
  compacto = false,
}: {
  sprint: Sprint
  resumen: ResumenSprint
  // Para "Completar": a qué sprint planificado mandar lo pendiente.
  sprintsPlanificados: Sprint[]
  proyectos: ProyectoOpcion[]
  compacto?: boolean
}) {
  const dias = sprint.estado === "activo" ? diasRestantesSprint(sprint) : null
  const nombreProyecto = proyectos.find((p) => p.id === sprint.proyecto_id)?.nombre

  return (
    <div className="flex flex-col gap-1">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <FlagIcon
        className={cn(
          "size-4 shrink-0",
          sprint.estado === "activo" ? "text-primary" : "text-muted-foreground"
        )}
      />
      <span className="font-medium">
        {sprint.nombre}
        {sprint.nombre !== codigoSprint(sprint.numero) && (
          <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">
            {codigoSprint(sprint.numero)}
          </span>
        )}
      </span>
      <Badge variant={ESTADOS_SPRINT[sprint.estado].variant}>
        {ESTADOS_SPRINT[sprint.estado].label}
      </Badge>
      {nombreProyecto && (
        <Badge variant="outline" className="font-normal">
          {nombreProyecto}
        </Badge>
      )}
      <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
        {(sprint.fecha_inicio || sprint.fecha_fin) && (
          <span className="flex items-center gap-1">
            <CalendarIcon className="size-3" />
            {sprint.fecha_inicio ? fechaCorta(sprint.fecha_inicio) : "…"}
            {" → "}
            {sprint.fecha_fin ? fechaCorta(sprint.fecha_fin) : "…"}
          </span>
        )}
        {dias !== null && (
          <span
            className={cn(
              dias < 0 && "text-destructive",
              dias === 0 && "text-amber-600"
            )}
          >
            {dias > 1 && `${dias} días restantes`}
            {dias === 1 && "último día"}
            {dias === 0 && "termina hoy"}
            {dias < 0 && `vencido hace ${-dias} ${-dias === 1 ? "día" : "días"}`}
          </span>
        )}
        <span>
          {sprint.estado === "activo"
            ? `${resumen.hechas}/${resumen.total} hechas`
            : `${resumen.total} ${resumen.total === 1 ? "tarjeta" : "tarjetas"}`}
          {resumen.puntos > 0 &&
            (sprint.estado === "activo"
              ? ` · ${resumen.puntos_hechos}/${resumen.puntos} pts`
              : ` · ${resumen.puntos} pts`)}
        </span>
      </span>
      <span className="ml-auto flex items-center gap-1">
        <SprintAcciones
          sprint={sprint}
          resumen={resumen}
          sprintsPlanificados={sprintsPlanificados}
          proyectos={proyectos}
        />
      </span>
    </div>
      {sprint.objetivo && !compacto && (
        <p className="pl-7 text-sm text-muted-foreground">{sprint.objetivo}</p>
      )}
    </div>
  )
}

function SprintAcciones({
  sprint,
  resumen,
  sprintsPlanificados,
  proyectos,
}: {
  sprint: Sprint
  resumen: ResumenSprint
  sprintsPlanificados: Sprint[]
  proyectos: ProyectoOpcion[]
}) {
  const [editar, setEditar] = useState(false)
  const [iniciar, setIniciar] = useState(false)
  const [completar, setCompletar] = useState(false)
  const [eliminar, setEliminar] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  const pendientes = resumen.total - resumen.hechas
  const otrosPlanificados = sprintsPlanificados.filter((s) => s.id !== sprint.id)

  function onGuardar(formData: FormData) {
    iniciarTransicion(async () => {
      if (await conToast(() => actualizarSprint(sprint.id, formData))) setEditar(false)
    })
  }
  function onIniciar(formData: FormData) {
    iniciarTransicion(async () => {
      if (await conToast(() => iniciarSprint(sprint.id, formData))) {
        setIniciar(false)
        toast.success(`${sprint.nombre} iniciado: sus tarjetas ya están en el tablero`)
      }
    })
  }
  function onCompletar(formData: FormData) {
    iniciarTransicion(async () => {
      if (await conToast(() => completarSprint(sprint.id, formData))) {
        setCompletar(false)
        toast.success(`${sprint.nombre} completado. Tablero limpio.`)
      }
    })
  }
  function onEliminar() {
    iniciarTransicion(async () => {
      if (await conToast(() => eliminarSprint(sprint.id))) setEliminar(false)
    })
  }

  return (
    <>
      {sprint.estado === "planificado" && (
        <Button size="sm" onClick={() => setIniciar(true)}>
          <PlayIcon data-icon="inline-start" />
          Iniciar sprint
        </Button>
      )}
      {sprint.estado === "activo" && (
        <Button size="sm" variant="outline" onClick={() => setCompletar(true)}>
          <CheckCircle2Icon data-icon="inline-start" />
          Completar sprint
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Acciones del sprint">
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

      <Dialog open={editar} onOpenChange={setEditar}>
        <DialogContent className="sm:max-w-lg">
          {editar && (
            <form action={onGuardar}>
              <DialogHeader>
                <DialogTitle>Editar {sprint.nombre}</DialogTitle>
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

      <Dialog open={iniciar} onOpenChange={setIniciar}>
        <DialogContent className="sm:max-w-lg">
          {iniciar && (
            <form action={onIniciar}>
              <DialogHeader>
                <DialogTitle>Iniciar {sprint.nombre}</DialogTitle>
                <DialogDescription>
                  {resumen.total === 0
                    ? "El sprint está vacío: se puede iniciar igual y sumarle tarjetas desde el tablero."
                    : `Sus ${resumen.total} ${resumen.total === 1 ? "tarjeta entra" : "tarjetas entran"} a Por hacer, en el orden que tienen acá.`}
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

      <Dialog open={completar} onOpenChange={setCompletar}>
        <DialogContent className="sm:max-w-lg">
          {completar && (
            <form action={onCompletar}>
              <DialogHeader>
                <DialogTitle>Completar {sprint.nombre}</DialogTitle>
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

      <AlertDialog open={eliminar} onOpenChange={setEliminar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {sprint.nombre}?</AlertDialogTitle>
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

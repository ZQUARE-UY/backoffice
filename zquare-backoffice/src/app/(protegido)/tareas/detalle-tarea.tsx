"use client"

import { useOptimistic, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowUpIcon, ChevronDownIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { BotonEliminar } from "@/components/boton-eliminar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import {
  Popover,
  PopoverPrimario,
  PopoverRotulo,
  PopoverTitulo,
} from "@/components/zq/popover"
import {
  BRIEF_TAREA,
  briefVacio,
  CAMPOS_BRIEF,
  codigoSprint,
  codigoTarea,
  ESTADOS_TAREA,
  ESTADOS_TAREA_ORDEN,
  PRIORIDADES_TAREA,
  tareaDesarrollada,
  type ComentarioTarea,
  type EstadoTarea,
  type PrioridadTarea,
  type Socio,
  type Sprint,
  type Tarea,
  type VersionTarea,
} from "@/lib/dominio"
import { fechaCorta, fechaRelativa } from "@/lib/formato"
import { cn } from "@/lib/utils"

import {
  actualizarTarea,
  cambiarColumnaTarea,
  cambiarDatoTarea,
  comentarTarea,
  eliminarTarea,
} from "./actions"
import { CamposTarea, type ClienteOpcion, type ProyectoOpcion } from "./campos-tarea"
import { urlDesarrollarTarea } from "./claude"
import { AvatarSocio, FechaLimite, PuntoColumna } from "./tarjeta"

// "Hoy" → "hoy" para usarla en medio de una frase.
function minuscula(texto: string): string {
  return texto.charAt(0).toLowerCase() + texto.slice(1)
}

type Datos = { estado: EstadoTarea; prioridad: PrioridadTarea; asignado_a: string | null }

const CHIP =
  "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full bg-muted px-3 text-[13px] text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <PopoverRotulo>{label}</PopoverRotulo>
      <div className="text-sm">{children}</div>
    </div>
  )
}

// Ficha de tarea (Popover; en celular, Hoja inferior). La tarjeta que la
// abre llega como `children`.
export function DetalleTarea({
  tarea,
  comentarios,
  versiones,
  socios,
  clientes,
  proyectos,
  sprints = [],
  children,
  abiertoInicial,
}: {
  tarea: Tarea
  comentarios: ComentarioTarea[]
  versiones: VersionTarea[]
  socios: Socio[]
  clientes: ClienteOpcion[]
  proyectos: ProyectoOpcion[]
  // Sprints abiertos, para el formulario y el dato en la ficha.
  sprints?: Sprint[]
  children: React.ReactNode
  // Deep link `?tarea=ZQ-N`: la tarjeta llega ya abierta desde el server.
  abiertoInicial?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [abierto, setAbierto] = useState(abiertoInicial ?? false)
  const [editando, setEditando] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  function cambiarAbierto(v: boolean) {
    setAbierto(v)
    if (v) return
    setEditando(false)
    // Al cerrar se limpia el deep link, para que un refresh no reabra.
    if (searchParams.get("tarea")) {
      const params = new URLSearchParams(searchParams)
      params.delete("tarea")
      const qs = params.toString()
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false })
    }
  }

  function onGuardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    iniciarTransicion(async () => {
      try {
        await actualizarTarea(tarea.id, formData)
        setEditando(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar")
      }
    })
  }

  return (
    <>
      <button
        type="button"
        className="block w-full cursor-pointer rounded-[10px] text-left"
        onClick={() => setAbierto(true)}
      >
        {children}
      </button>
      {editando ? (
        <Popover
          open={abierto}
          onOpenChange={cambiarAbierto}
          aria-label={`Editar ${codigoTarea(tarea.numero)}`}
          onSubmit={onGuardar}
          acciones={
            <>
              <Button type="button" variant="ghost" onClick={() => setEditando(false)} disabled={pendiente}>
                Cancelar
              </Button>
              <PopoverPrimario pendiente={pendiente}>
                {pendiente && <Spinner data-icon="inline-start" />}
                Guardar cambios
              </PopoverPrimario>
            </>
          }
        >
          <p className="zq-rotulo">{codigoTarea(tarea.numero)}</p>
          <PopoverTitulo>Editar tarea</PopoverTitulo>
          <CamposTarea
            tarea={tarea}
            socios={socios}
            clientes={clientes}
            proyectos={proyectos}
            sprints={sprints}
          />
        </Popover>
      ) : (
        <Ficha
          abierto={abierto}
          onAbiertoChange={cambiarAbierto}
          onEditar={() => setEditando(true)}
          tarea={tarea}
          comentarios={comentarios}
          versiones={versiones}
          socios={socios}
          clientes={clientes}
          proyectos={proyectos}
          sprints={sprints}
        />
      )}
    </>
  )
}

function Ficha({
  abierto,
  onAbiertoChange,
  onEditar,
  tarea,
  comentarios,
  versiones,
  socios,
  clientes,
  proyectos,
  sprints,
}: {
  abierto: boolean
  onAbiertoChange: (v: boolean) => void
  onEditar: () => void
  tarea: Tarea
  comentarios: ComentarioTarea[]
  versiones: VersionTarea[]
  socios: Socio[]
  clientes: ClienteOpcion[]
  proyectos: ProyectoOpcion[]
  sprints: Sprint[]
}) {
  const [, iniciarTransicion] = useTransition()
  // Los chips cambian al toque; el server confirma al revalidar.
  const [datos, cambiarOptimista] = useOptimistic(
    { estado: tarea.estado, prioridad: tarea.prioridad, asignado_a: tarea.asignado_a } as Datos,
    (actual: Datos, cambio: Partial<Datos>) => ({ ...actual, ...cambio })
  )

  function cambiar(cambio: Partial<Datos>, accion: () => Promise<void>) {
    iniciarTransicion(async () => {
      cambiarOptimista(cambio)
      try {
        await accion()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar el cambio")
      }
    })
  }

  const nombreSocio = (id: string | null) => socios.find((s) => s.id === id)?.nombre ?? null
  const responsable = nombreSocio(datos.asignado_a)
  const cliente = clientes.find((c) => c.id === tarea.cliente_id)
  const proyecto = proyectos.find((p) => p.id === tarea.proyecto_id)
  const sprint = sprints.find((s) => s.id === tarea.sprint_id)
  const creador = nombreSocio(tarea.created_by)?.split(" ")[0]

  return (
    <Popover
      open={abierto}
      onOpenChange={onAbiertoChange}
      aria-label={`${codigoTarea(tarea.numero)} · ${tarea.titulo}`}
      datos={
        <>
          <Dato label="Columna">
            <DropdownMenu>
              <DropdownMenuTrigger className={CHIP}>
                <PuntoColumna estado={datos.estado} />
                {ESTADOS_TAREA[datos.estado].label}
                <ChevronDownIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuRadioGroup
                  value={datos.estado}
                  onValueChange={(v) => {
                    const estado = v as EstadoTarea
                    cambiar({ estado }, () => cambiarColumnaTarea(tarea.id, estado))
                  }}
                >
                  {ESTADOS_TAREA_ORDEN.map((e) => (
                    <DropdownMenuRadioItem key={e} value={e}>
                      <PuntoColumna estado={e} />
                      {ESTADOS_TAREA[e].label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </Dato>
          <Dato label="Prioridad">
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  CHIP,
                  (datos.prioridad === "alta" || datos.prioridad === "urgente") && "font-semibold text-aviso"
                )}
              >
                {PRIORIDADES_TAREA[datos.prioridad].label}
                <ChevronDownIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                <DropdownMenuRadioGroup
                  value={datos.prioridad}
                  onValueChange={(v) => {
                    const prioridad = v as PrioridadTarea
                    cambiar({ prioridad }, () => cambiarDatoTarea(tarea.id, { prioridad }))
                  }}
                >
                  {Object.entries(PRIORIDADES_TAREA).map(([valor, p]) => (
                    <DropdownMenuRadioItem key={valor} value={valor}>
                      {p.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </Dato>
          <Dato label="Responsable">
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  responsable
                    ? CHIP
                    : "inline-flex min-h-8 items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                )}
                aria-label={responsable ? `Responsable: ${responsable}. Cambiar` : "Asignar responsable"}
              >
                {responsable ? (
                  <>
                    <AvatarSocio nombre={responsable} className="-ml-1.5 size-5 text-[9px]" />
                    {responsable}
                  </>
                ) : (
                  "+ Asignar"
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuRadioGroup
                  value={datos.asignado_a ?? ""}
                  onValueChange={(v) => {
                    const asignado_a = (v as string) || null
                    cambiar({ asignado_a }, () => cambiarDatoTarea(tarea.id, { asignado_a }))
                  }}
                >
                  {socios.map((s) => (
                    <DropdownMenuRadioItem key={s.id} value={s.id}>
                      {s.nombre}
                    </DropdownMenuRadioItem>
                  ))}
                  <DropdownMenuRadioItem value="">Sin asignar</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </Dato>
          <Dato label="Vence">
            {tarea.fecha_limite ? (
              <FechaLimite tarea={{ ...tarea, estado: datos.estado }} corta={false} />
            ) : (
              <span className="text-muted-foreground">Sin fecha</span>
            )}
          </Dato>
          <Dato label="Sprint">
            {sprint
              ? codigoSprint(sprint.numero)
              : tarea.sprint_id
                ? "Sprint cerrado (archivada)"
                : <span className="text-muted-foreground">Sin sprint</span>}
          </Dato>
          <Dato label="Cliente · Proyecto">
            <span>
              {cliente ? (
                <Link href={`/clientes/${cliente.id}`} className="hover:underline">
                  {cliente.nombre}
                </Link>
              ) : (
                "Interna"
              )}
              {" · "}
              {proyecto ? (
                <Link href={`/proyectos/${proyecto.id}`} className="hover:underline">
                  {proyecto.nombre}
                </Link>
              ) : (
                "—"
              )}
            </span>
          </Dato>
          {(tarea.estimacion || tarea.codigo_proyecto || tarea.epica || tarea.horas != null) && (
            <Dato label="Planificación">
              <span className="text-[13px]">
                {[
                  tarea.codigo_proyecto,
                  tarea.epica,
                  tarea.estimacion && `${tarea.estimacion} ${tarea.estimacion === 1 ? "punto" : "puntos"}`,
                  tarea.horas != null && `${tarea.horas.toLocaleString("es-UY")} h`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </Dato>
          )}
          {tarea.github_repo && tarea.github_issue_number && (
            <Dato label="GitHub">
              <a
                href={`https://github.com/${tarea.github_repo}/issues/${tarea.github_issue_number}`}
                target="_blank"
                rel="noreferrer"
                className="text-[13px] hover:underline"
              >
                {tarea.github_repo}#{tarea.github_issue_number} ↗
              </a>
            </Dato>
          )}
          <p className="m-0 text-xs leading-4 text-muted-foreground">
            Creada{creador && ` por ${creador}`} · {minuscula(fechaRelativa(tarea.created_at))}
            {versiones.length > 1 && ` · ${versiones.length} versiones`}
          </p>
        </>
      }
      acciones={
        <div className="flex w-full items-center justify-between gap-2">
          <BotonEliminar
            soloIcono
            accion={async () => {
              await eliminarTarea(tarea.id)
              onAbiertoChange(false)
            }}
            titulo={`¿Eliminar ${codigoTarea(tarea.numero)}?`}
            descripcion="La tarjeta deja de verse en el tablero. Se puede recuperar desde la base si hiciera falta."
          />
          <Button onClick={onEditar} className="max-escritorio:h-12 max-escritorio:flex-1">
            Editar
          </Button>
        </div>
      }
    >
      <div className="pr-8">
        <p className="m-0 text-xs leading-4 font-semibold text-muted-foreground">
          {codigoTarea(tarea.numero)}
        </p>
        <PopoverTitulo className="mt-0.5">{tarea.titulo}</PopoverTitulo>
      </div>

      {tarea.etiquetas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tarea.etiquetas.map((e) => (
            <span key={e} className="rounded-full bg-muted px-2.5 text-xs leading-[22px]">
              {e}
            </span>
          ))}
        </div>
      )}

      {tarea.descripcion && <Descripcion texto={tarea.descripcion} />}

      <Brief tarea={tarea} />

      <Comentarios tareaId={tarea.id} comentarios={comentarios} />
    </Popover>
  )
}

function Descripcion({ texto }: { texto: string }) {
  const [completa, setCompleta] = useState(false)
  const larga = texto.length > 280 || texto.split("\n").length > 4
  return (
    <div className="flex flex-col items-start gap-1">
      <p className={cn("m-0 whitespace-pre-wrap", !completa && larga && "line-clamp-4")}>{texto}</p>
      {larga && (
        <button
          type="button"
          onClick={() => setCompleta((v) => !v)}
          className="text-[13px] font-semibold hover:underline"
        >
          {completa ? "Leer menos" : "Leer más"}
        </button>
      )}
    </div>
  )
}

// El brief: si falta el resultado esperado, invita a que Claude lo desarrolle;
// si está, se lee desplegándolo.
function Brief({ tarea }: { tarea: Tarea }) {
  const [abierto, setAbierto] = useState(false)
  const listo = tareaDesarrollada(tarea)
  const vacio = briefVacio(tarea)

  return (
    <div className="flex flex-col gap-3 rounded-[10px] bg-muted px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-lima text-carbon"
        >
          <SparklesIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block font-semibold">
            {listo ? "Brief listo" : vacio ? "Sin brief todavía" : "Brief a medias"}
          </strong>
          <span className="block text-xs leading-4 text-muted-foreground">
            {listo
              ? "Qué hay que lograr y cómo"
              : vacio
                ? "Claude te hace unas preguntas y lo completa"
                : "Falta el resultado esperado: Claude lo completa"}
          </span>
        </span>
        {listo ? (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={abierto}
            onClick={() => setAbierto((v) => !v)}
          >
            {abierto ? "Ocultar" : "Leer"}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href={urlDesarrollarTarea(tarea)} target="_blank" rel="noreferrer" />}
          >
            Desarrollar
          </Button>
        )}
      </div>
      {(abierto || (!listo && !vacio)) && (
        <dl className="m-0 flex flex-col gap-2.5 border-t border-border pt-3">
          {CAMPOS_BRIEF.map((campo) =>
            tarea[campo] ? (
              <div key={campo}>
                <dt className="zq-rotulo">{BRIEF_TAREA[campo].label}</dt>
                <dd className="m-0 whitespace-pre-wrap">{tarea[campo]}</dd>
              </div>
            ) : null
          )}
        </dl>
      )}
    </div>
  )
}

function Comentarios({ tareaId, comentarios }: { tareaId: string; comentarios: ComentarioTarea[] }) {
  const [texto, setTexto] = useState("")
  const [enviando, iniciarEnvio] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const cuerpo = texto.trim()
    if (!cuerpo) return
    const datos = new FormData()
    datos.set("cuerpo", cuerpo)
    iniciarEnvio(async () => {
      try {
        await comentarTarea(tareaId, datos)
        setTexto("")
        inputRef.current?.focus()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo comentar")
      }
    })
  }

  return (
    <section className="mt-1 flex flex-1 flex-col gap-3" aria-label="Comentarios">
      <h3 className="zq-rotulo">Comentarios</h3>
      {comentarios.length === 0 ? (
        <p className="m-0 -mt-1 text-xs text-muted-foreground">Sin comentarios todavía</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {comentarios.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <AvatarSocio nombre={c.autor} className="size-7 text-[11px]" />
              <div className="flex min-w-0 flex-col">
                <span>
                  <strong className="font-semibold">{c.autor.split(" ")[0]}</strong>{" "}
                  <span className="text-xs text-muted-foreground" title={fechaCorta(c.created_at)}>
                    · {minuscula(fechaRelativa(c.created_at))}
                  </span>
                </span>
                <span className="whitespace-pre-wrap">{c.cuerpo}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={enviar}
        className="mt-auto flex items-center gap-2 rounded-[10px] border border-input py-1.5 pr-1.5 pl-3.5 focus-within:ring-2 focus-within:ring-ring"
      >
        <input
          ref={inputRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribí un comentario…"
          aria-label="Comentario"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" size="icon" aria-label="Enviar comentario" disabled={enviando || !texto.trim()}>
          {enviando ? <Spinner /> : <ArrowUpIcon />}
        </Button>
      </form>
    </section>
  )
}

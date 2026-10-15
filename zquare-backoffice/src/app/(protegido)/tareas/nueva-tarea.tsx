"use client"

import { useEffect, useState, useTransition } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { EVENTO_CREAR } from "@/components/captura-rapida"
import { Button } from "@/components/ui/button"
import { CampoDato, FechaNativa, Interruptor, SelectNativo } from "@/components/zq/campos"
import { Popover, PopoverCancelar, PopoverPrimario } from "@/components/zq/popover"
import {
  codigoSprint,
  codigoTarea,
  ESTADOS_SPRINT,
  ESTADOS_TAREA,
  PRIORIDADES_TAREA,
  type EstadoTarea,
  type Socio,
  type Sprint,
} from "@/lib/dominio"

import { crearTarea } from "./actions"
import { type ClienteOpcion, type ProyectoOpcion } from "./campos-tarea"
import { urlDesarrollarTarea } from "./claude"

const COLUMNAS: EstadoTarea[] = ["backlog", "por_hacer", "en_curso", "en_revision"]

// Nueva tarea (Popover): a la izquierda el título, una descripción opcional y
// el interruptor "Que Claude desarrolle el brief"; a la derecha dónde va.
// Solo el título es obligatorio (3 caracteres o más) y Enter crea.
export function NuevaTarea({
  socios,
  clientes,
  proyectos,
  sprints = [],
  estadoInicial = "por_hacer",
  sprintInicial,
  variante = "boton",
  escucharCrear = false,
}: {
  socios: Socio[]
  clientes: ClienteOpcion[]
  proyectos: ProyectoOpcion[]
  sprints?: Sprint[]
  estadoInicial?: EstadoTarea
  sprintInicial?: string | null
  variante?: "boton" | "columna"
  // El botón flotante "+" de celular abre esta caja en vez de la captura
  // rápida (una sola por pantalla debería escucharlo).
  escucharCrear?: boolean
}) {
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    if (!escucharCrear) return
    function abrir(e: Event) {
      e.preventDefault()
      setAbierto(true)
    }
    window.addEventListener(EVENTO_CREAR, abrir)
    return () => window.removeEventListener(EVENTO_CREAR, abrir)
  }, [escucharCrear])

  return (
    <>
      {variante === "columna" ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={() => setAbierto(true)}
        >
          <PlusIcon data-icon="inline-start" />
          Agregar tarjeta
        </Button>
      ) : (
        // En celular el botón flotante "+" hace lo mismo.
        <Button onClick={() => setAbierto(true)} className={escucharCrear ? "max-escritorio:hidden" : undefined}>
          <PlusIcon data-icon="inline-start" />
          Nueva tarea
        </Button>
      )}
      {/* Se monta al abrir: cada apertura arranca con el formulario limpio. */}
      {abierto && (
        <FormularioNuevaTarea
          onCerrar={() => setAbierto(false)}
          socios={socios}
          clientes={clientes}
          proyectos={proyectos}
          sprints={sprints}
          estadoInicial={estadoInicial}
          sprintInicial={sprintInicial ?? null}
        />
      )}
    </>
  )
}

function FormularioNuevaTarea({
  onCerrar,
  socios,
  clientes,
  proyectos,
  sprints,
  estadoInicial,
  sprintInicial,
}: {
  onCerrar: () => void
  socios: Socio[]
  clientes: ClienteOpcion[]
  proyectos: ProyectoOpcion[]
  sprints: Sprint[]
  estadoInicial: EstadoTarea
  sprintInicial: string | null
}) {
  const [abierto, setAbierto] = useState(true)
  const [titulo, setTitulo] = useState("")
  const [conClaude, setConClaude] = useState(true)
  const [creada, setCreada] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  const largo = titulo.trim().length
  const listo = largo >= 3 && !creada
  const falta =
    largo === 0
      ? "Falta el título"
      : largo < 3
        ? "El título necesita 3 caracteres o más"
        : creada
          ? null
          : "Enter para crear"

  function cerrar() {
    setAbierto(false)
    // Deja terminar la animación de salida antes de desmontar.
    setTimeout(onCerrar, 200)
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!listo || pendiente) return
    const form = new FormData(e.currentTarget)
    const datos = new FormData()
    for (const campo of ["titulo", "descripcion", "estado", "prioridad", "asignado_a", "fecha_limite"]) {
      datos.set(campo, String(form.get(campo) ?? ""))
    }
    // "Cliente o proyecto" es un solo select: p:<id> o c:<id>.
    const destino = String(form.get("destino") ?? "")
    if (destino.startsWith("p:")) {
      const proyecto = proyectos.find((p) => p.id === destino.slice(2))
      datos.set("proyecto_id", proyecto?.id ?? "")
      datos.set("cliente_id", proyecto?.cliente_id ?? "")
    } else if (destino.startsWith("c:")) {
      datos.set("cliente_id", destino.slice(2))
    }
    if (sprints.length > 0) datos.set("sprint_id", String(form.get("sprint_id") ?? ""))

    // La pestaña de Claude se abre ya, dentro del gesto del usuario (si no,
    // el navegador la bloquea), y recibe la URL cuando existe el número.
    const ventana = conClaude ? window.open("about:blank", "_blank") : null

    iniciarTransicion(async () => {
      try {
        const nueva = await crearTarea(datos)
        if (ventana) {
          ventana.opener = null
          ventana.location.href = urlDesarrollarTarea({ numero: nueva.numero, titulo: titulo.trim() })
        }
        setCreada(true)
        toast.success(`${codigoTarea(nueva.numero)} creada`)
        setTimeout(cerrar, 700)
      } catch (err) {
        ventana?.close()
        toast.error(err instanceof Error ? err.message : "No se pudo crear la tarea")
      }
    })
  }

  const conCliente = proyectos.filter((p) => p.cliente_id)
  const internos = proyectos.filter((p) => !p.cliente_id)
  const activo = sprints.find((s) => s.estado === "activo")

  return (
    <Popover
      open={abierto}
      onOpenChange={(v) => !v && cerrar()}
      aria-label="Nueva tarea"
      onSubmit={onSubmit}
      falta={falta}
      datos={
        <>
          <CampoDato label="Columna" htmlFor="nt-estado">
            <SelectNativo id="nt-estado" name="estado" defaultValue={estadoInicial}>
              {COLUMNAS.map((c) => (
                <option key={c} value={c}>
                  {ESTADOS_TAREA[c].label}
                </option>
              ))}
            </SelectNativo>
          </CampoDato>
          <CampoDato label="Prioridad" htmlFor="nt-prioridad">
            <SelectNativo id="nt-prioridad" name="prioridad" defaultValue="media">
              {Object.entries(PRIORIDADES_TAREA).map(([valor, p]) => (
                <option key={valor} value={valor}>
                  {p.label}
                </option>
              ))}
            </SelectNativo>
          </CampoDato>
          <CampoDato label="Responsable" htmlFor="nt-responsable">
            <SelectNativo id="nt-responsable" name="asignado_a" defaultValue="">
              <option value="">Sin asignar</option>
              {socios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </SelectNativo>
          </CampoDato>
          <CampoDato label="Fecha límite" htmlFor="nt-fecha">
            <FechaNativa id="nt-fecha" name="fecha_limite" />
          </CampoDato>
          <CampoDato label="Cliente o proyecto" htmlFor="nt-destino">
            <SelectNativo id="nt-destino" name="destino" defaultValue="">
              <option value="">Interna</option>
              {conCliente.length > 0 && (
                <optgroup label="Proyectos">
                  {conCliente.map((p) => (
                    <option key={p.id} value={`p:${p.id}`}>
                      {p.cliente} · {p.nombre}
                    </option>
                  ))}
                </optgroup>
              )}
              {internos.length > 0 && (
                <optgroup label="Proyectos internos">
                  {internos.map((p) => (
                    <option key={p.id} value={`p:${p.id}`}>
                      {p.nombre}
                    </option>
                  ))}
                </optgroup>
              )}
              {clientes.length > 0 && (
                <optgroup label="Clientes">
                  {clientes.map((c) => (
                    <option key={c.id} value={`c:${c.id}`}>
                      {c.nombre}
                    </option>
                  ))}
                </optgroup>
              )}
            </SelectNativo>
          </CampoDato>
          {sprints.length > 0 && (
            <CampoDato label="Sprint" htmlFor="nt-sprint">
              <SelectNativo
                id="nt-sprint"
                name="sprint_id"
                defaultValue={sprintInicial ?? (estadoInicial !== "backlog" ? activo?.id : "") ?? ""}
              >
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {codigoSprint(s.numero)} ({ESTADOS_SPRINT[s.estado].label.toLowerCase()})
                  </option>
                ))}
                <option value="">Sin sprint</option>
              </SelectNativo>
            </CampoDato>
          )}
        </>
      }
      acciones={
        <>
          <PopoverCancelar />
          <PopoverPrimario listo={listo} pendiente={pendiente} guardado={creada} textoGuardado="Creada">
            Crear tarea
          </PopoverPrimario>
        </>
      }
    >
      <p className="zq-rotulo">Nueva tarea</p>
      <input
        name="titulo"
        value={titulo}
        onChange={(e) => {
          setTitulo(e.target.value)
          setCreada(false)
        }}
        placeholder="¿Qué hay que hacer?"
        aria-label="Título"
        autoComplete="off"
        className="w-full rounded-[10px] border border-input bg-transparent px-3 py-2.5 font-display text-[22px] leading-[30px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      <textarea
        name="descripcion"
        placeholder="Descripción (opcional)"
        aria-label="Descripción"
        rows={4}
        className="w-full resize-none rounded-[10px] border border-input bg-transparent px-3 py-2.5 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Interruptor id="nt-claude" checked={conClaude} onCheckedChange={setConClaude}>
        Que Claude desarrolle el brief
        <span className="block text-xs leading-4 text-muted-foreground">
          Al crearla se abre claude.ai: te hace unas preguntas y completa el resultado esperado
        </span>
      </Interruptor>
    </Popover>
  )
}

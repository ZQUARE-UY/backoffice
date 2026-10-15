"use client"

import { cloneElement, useEffect, useState, useTransition, type ReactElement } from "react"
import { PencilIcon, PlusIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { EVENTO_CREAR } from "@/components/captura-rapida"
import { Button } from "@/components/ui/button"
import { CampoDato, Interruptor, SelectNativo } from "@/components/zq/campos"
import { Popover, PopoverCancelar, PopoverPrimario } from "@/components/zq/popover"
import { sumarDias } from "@/lib/disponibilidad"
import { DURACIONES_REUNION, type Cliente, type Socio, type SolicitudReunion } from "@/lib/dominio"
import { iniciales } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { crearSolicitud, editarSolicitud } from "./actions"
import { CalendarioRango, diasHabiles, etiquetaCorta } from "./calendario-rango"

type Catalogos = {
  socios: Socio[]
  clientes: Pick<Cliente, "id" | "nombre" | "email">[]
  proyectos: { id: string; nombre: string; cliente_id: string | null }[]
}

const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Nueva reunión (Popover): con quién y en qué días puede caer. Los horarios
// los marca después cada socio en la encuesta. El mismo formulario edita una
// reunión ya creada.
export function FormularioSolicitud({
  socios,
  clientes,
  proyectos,
  hoy,
  solicitud,
  trigger,
  escucharCrear = false,
}: Catalogos & {
  // Viene del server para que el día inicial sea el de Montevideo.
  hoy: string
  // Si viene, el popover edita esa solicitud en vez de crear una.
  solicitud?: SolicitudReunion
  trigger: ReactElement<{ onClick?: () => void }>
  // El botón flotante "+" de celular abre este alta.
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
      {cloneElement(trigger, { onClick: () => setAbierto(true) })}
      {abierto && (
        <Formulario
          socios={socios}
          clientes={clientes}
          proyectos={proyectos}
          hoy={hoy}
          solicitud={solicitud}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </>
  )
}

function Formulario({
  socios,
  clientes,
  proyectos,
  hoy,
  solicitud,
  onCerrar,
}: Catalogos & { hoy: string; solicitud?: SolicitudReunion; onCerrar: () => void }) {
  const editando = Boolean(solicitud)
  const [abierto, setAbierto] = useState(true)
  const [titulo, setTitulo] = useState(solicitud?.titulo ?? "")
  const [requeridos, setRequeridos] = useState<Set<string>>(
    () => new Set(solicitud?.socios_requeridos ?? socios.map((s) => s.id))
  )
  const [destino, setDestino] = useState(
    solicitud?.proyecto_id ? `p:${solicitud.proyecto_id}` : solicitud?.cliente_id ? `c:${solicitud.cliente_id}` : ""
  )
  const [invitarCliente, setInvitarCliente] = useState(solicitud?.invitar_cliente ?? true)
  const [mails, setMails] = useState<string[]>(solicitud?.invitados_externos ?? [])
  const [nuevoMail, setNuevoMail] = useState("")
  const [notas, setNotas] = useState(solicitud?.notas ?? "")
  const [duracion, setDuracion] = useState(String(solicitud?.duracion_min ?? 30))
  const [desde, setDesde] = useState<string | null>(solicitud?.ventana_desde ?? sumarDias(hoy, 1))
  const [hasta, setHasta] = useState<string | null>(solicitud?.ventana_hasta ?? sumarDias(hoy, 7))
  const [listoGuardado, setListoGuardado] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  // Cliente elegido: directo, o el del proyecto.
  const proyecto = destino.startsWith("p:") ? proyectos.find((p) => p.id === destino.slice(2)) : null
  const clienteId = destino.startsWith("c:") ? destino.slice(2) : (proyecto?.cliente_id ?? null)
  const cliente = clientes.find((c) => c.id === clienteId) ?? null

  const falta =
    titulo.trim().length < 3
      ? "Falta el título"
      : requeridos.size === 0
        ? "Elegí al menos un socio"
        : !desde || !hasta
          ? "Elegí los días en el calendario"
          : null
  const listo = !falta && !listoGuardado

  function cerrar() {
    setAbierto(false)
    setTimeout(onCerrar, 200)
  }

  function agregarMail() {
    const m = nuevoMail.trim().toLowerCase()
    if (!MAIL.test(m)) {
      if (m) toast.error(`"${m}" no parece un mail`)
      return
    }
    if (!mails.includes(m)) setMails((x) => [...x, m])
    setNuevoMail("")
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!listo || pendiente || !desde || !hasta) return
    const datos = new FormData()
    datos.set("titulo", titulo.trim())
    datos.set("notas", notas)
    datos.set("cliente_id", clienteId ?? "")
    datos.set("proyecto_id", proyecto?.id ?? "")
    datos.set("duracion_min", duracion)
    datos.set("ventana_desde", desde)
    datos.set("ventana_hasta", hasta)
    for (const id of requeridos) datos.append("socios_requeridos", id)
    if (cliente?.email && invitarCliente) datos.set("invitar_cliente", "on")
    datos.set("invitados_externos", mails.join(", "))

    iniciarTransicion(async () => {
      if (solicitud) {
        const r = await editarSolicitud(solicitud.id, datos)
        if (!r.ok) {
          toast.error(r.error ?? "No se pudo guardar")
          return
        }
        if (r.advertencia) toast.warning(r.advertencia)
        else toast.success("Reunión actualizada")
      } else {
        try {
          await crearSolicitud(datos)
          toast.success(`Encuesta enviada: ${requeridos.size} ${requeridos.size === 1 ? "socio la recibe" : "socios la reciben"}`)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "No se pudo crear")
          return
        }
      }
      setListoGuardado(true)
      setTimeout(cerrar, 700)
    })
  }

  const conCliente = proyectos.filter((p) => p.cliente_id)

  return (
    <Popover
      open={abierto}
      onOpenChange={(v) => !v && !pendiente && cerrar()}
      aria-label={editando ? "Editar la reunión" : "Nueva reunión"}
      onSubmit={onSubmit}
      falta={listoGuardado ? null : falta}
      datos={
        <>
          <div className="flex flex-col gap-2">
            <span className="zq-rotulo">Duración</span>
            <div role="group" aria-label="Duración" className="flex rounded-[10px] bg-muted p-[3px]">
              {DURACIONES_REUNION.map((d) => (
                <button
                  key={d.valor}
                  type="button"
                  aria-pressed={duracion === d.valor}
                  onClick={() => setDuracion(d.valor)}
                  className={cn(
                    "h-11 flex-1 rounded-lg text-sm",
                    duracion === d.valor ? "bg-card font-semibold shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {d.valor === "60" ? "1 hora" : `${d.valor} min`}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="zq-rotulo">Días candidatos</span>
            <CalendarioRango
              hoy={hoy}
              desde={desde}
              hasta={hasta}
              onChange={(d, h) => {
                setDesde(d)
                setHasta(h)
              }}
            />
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {!desde
                ? "Elegí el primer día"
                : !hasta
                  ? `${etiquetaCorta(desde)} → … tocá el último día`
                  : `${etiquetaCorta(desde)} → ${etiquetaCorta(hasta)} · ${diasHabiles(desde, hasta)} ${diasHabiles(desde, hasta) === 1 ? "día hábil" : "días hábiles"}`}
            </span>
          </div>
          {editando && solicitud?.estado === "agendada" && (
            <p className="m-0 text-xs text-muted-foreground">
              Ya está agendada: el evento de Google se actualiza con estos cambios. Para cambiar el horario usá
              &quot;Elegir otro horario&quot; en la ficha.
            </p>
          )}
        </>
      }
      acciones={
        <>
          <PopoverCancelar />
          <PopoverPrimario listo={listo} pendiente={pendiente} guardado={listoGuardado} textoGuardado={editando ? "Guardado" : "Enviada"}>
            {editando ? "Guardar cambios" : "Pedir disponibilidad"}
          </PopoverPrimario>
        </>
      }
    >
      <p className="zq-rotulo">{editando ? "Editar la reunión" : "Nueva reunión"}</p>
      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="¿De qué es la reunión?"
        aria-label="Título"
        autoComplete="off"
        className="w-full rounded-[10px] border border-input bg-transparent px-3 py-2.5 font-display text-[22px] leading-[30px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />

      <div role="group" aria-label="Socios que tienen que estar" className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Socios que tienen que estar</span>
        <div className="flex flex-wrap gap-2">
          {socios.map((s) => {
            const on = requeridos.has(s.id)
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                aria-label={s.nombre}
                title={s.nombre}
                onClick={() =>
                  setRequeridos((r) => {
                    const sig = new Set(r)
                    if (on) sig.delete(s.id)
                    else sig.add(s.id)
                    return sig
                  })
                }
                className={cn(
                  "inline-flex size-11 items-center justify-center rounded-full text-[11px] font-bold",
                  on ? "bg-lima text-carbon ring-2 ring-foreground ring-offset-2 ring-offset-card" : "bg-muted text-muted-foreground"
                )}
              >
                {iniciales(s.nombre)}
              </button>
            )
          })}
        </div>
      </div>

      <CampoDato label="Cliente o proyecto" htmlFor="nr-destino">
        <SelectNativo id="nr-destino" value={destino} onChange={(e) => setDestino(e.target.value)}>
          <option value="">Interna (solo socios)</option>
          {clientes.length > 0 && (
            <optgroup label="Clientes">
              {clientes.map((c) => (
                <option key={c.id} value={`c:${c.id}`}>
                  {c.nombre}
                </option>
              ))}
            </optgroup>
          )}
          {conCliente.length > 0 && (
            <optgroup label="Proyectos">
              {conCliente.map((p) => (
                <option key={p.id} value={`p:${p.id}`}>
                  {clientes.find((c) => c.id === p.cliente_id)?.nombre ?? "—"} · {p.nombre}
                </option>
              ))}
            </optgroup>
          )}
        </SelectNativo>
      </CampoDato>

      <div className="flex flex-col gap-2">
        {cliente &&
          (cliente.email ? (
            <Interruptor id="nr-invitar" checked={invitarCliente} onCheckedChange={setInvitarCliente}>
              Invitar al cliente
              <span className="block text-xs text-muted-foreground">{cliente.email} recibe la invitación al Meet</span>
            </Interruptor>
          ) : (
            <span className="text-xs text-muted-foreground">{cliente.nombre} no tiene mail cargado.</span>
          ))}
        <div className="flex flex-wrap items-center gap-1.5">
          {mails.map((m) => (
            <span key={m} className="zq-chip gap-1 pr-1 text-[13px]">
              {m}
              <button
                type="button"
                aria-label={`Quitar ${m}`}
                onClick={() => setMails((x) => x.filter((y) => y !== m))}
                className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
          <input
            value={nuevoMail}
            onChange={(e) => setNuevoMail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault()
                agregarMail()
              }
            }}
            onBlur={() => nuevoMail.trim() && agregarMail()}
            placeholder="Otro invitado: mail + Enter"
            aria-label="Agregar un invitado por mail"
            inputMode="email"
            className="min-w-[200px] flex-1 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <textarea
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        placeholder="Notas para los invitados (opcional)"
        aria-label="Notas"
        className="min-h-[110px] w-full flex-1 resize-none rounded-[10px] border border-input bg-transparent px-3 py-2.5 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
    </Popover>
  )
}

export function NuevaSolicitud(props: Catalogos & { hoy: string; escucharCrear?: boolean }) {
  return (
    <FormularioSolicitud
      {...props}
      trigger={
        <Button>
          <PlusIcon data-icon="inline-start" />
          Nueva reunión
        </Button>
      }
    />
  )
}

export function EditarSolicitud(props: Catalogos & { hoy: string; solicitud: SolicitudReunion }) {
  return (
    <FormularioSolicitud
      {...props}
      trigger={
        <Button variant="outline" size="sm">
          <PencilIcon data-icon="inline-start" />
          Editar
        </Button>
      }
    />
  )
}

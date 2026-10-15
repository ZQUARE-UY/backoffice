"use client"

import { useState, useTransition } from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Popover, PopoverCancelar, PopoverPrimario, PopoverTitulo } from "@/components/zq/popover"
import {
  diasDeVentana,
  instanteEnZona,
  normalizar,
  paredEnZona,
  partirPorDia,
  restar,
  type Intervalo,
} from "@/lib/disponibilidad"
import { type Socio, type SolicitudReunion } from "@/lib/dominio"
import { iniciales } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { guardarRespuesta, marcarNoPuedo } from "./actions"
import { etiquetaCorta } from "./calendario-rango"

// Una celda por hora, de 9 a 17 (la última es 17 a 18).
const HORAS = [9, 10, 11, 12, 13, 14, 15, 16, 17]
const POR_PAGINA = 5
const HORA = 3_600_000
const NOMBRES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
const COLORES = ["bg-foreground", "bg-arena", "bg-aviso", "bg-positivo"]

export type RespuestaEncuesta = {
  socio_id: string
  franjas: { inicio: string; fin: string }[]
}

type SolicitudEncuesta = Pick<
  SolicitudReunion,
  "id" | "titulo" | "duracion_min" | "ventana_desde" | "ventana_hasta" | "socios_requeridos" | "created_by"
>

const pad = (h: number) => `${String(h).padStart(2, "0")}:00`
const clave = (fecha: string, h: number) => `${fecha}|${h}`

function diaSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay()
}

// ¿Las franjas cubren entera la hora [h, h+1) de ese día?
function cubre(franjas: Intervalo[], fecha: string, h: number): boolean {
  const ini = instanteEnZona(fecha, pad(h))
  const fin = ini + HORA
  return franjas.some((f) => f.inicio <= ini && f.fin >= fin)
}

function aIntervalos(r: RespuestaEncuesta | undefined): Intervalo[] {
  return (r?.franjas ?? []).map((f) => ({ inicio: Date.parse(f.inicio), fin: Date.parse(f.fin) }))
}

// Encuesta de disponibilidad (Popover): grilla días × horas. Tocar una celda
// la marca en lima; tocar el nombre de un día marca el día entero. Cada
// celda muestra puntitos con los socios que ya pueden. A la derecha, quién
// respondió y los mejores huecos.
export function Encuesta({
  solicitud,
  respuestas,
  socios,
  miSocioId,
  hoy,
  pedidaPor,
  etiqueta = "Marcar mi disponibilidad",
  variante = "default",
}: {
  solicitud: SolicitudEncuesta
  respuestas: RespuestaEncuesta[]
  socios: Socio[]
  miSocioId: string | null
  hoy: string
  pedidaPor: string | null
  etiqueta?: string
  variante?: "default" | "outline" | "ghost"
}) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <Button size="sm" variant={variante} className="self-start" onClick={() => setAbierto(true)}>
        {etiqueta}
      </Button>
      {abierto && (
        <Formulario
          solicitud={solicitud}
          respuestas={respuestas}
          socios={socios}
          miSocioId={miSocioId}
          hoy={hoy}
          pedidaPor={pedidaPor}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </>
  )
}

function Formulario({
  solicitud,
  respuestas,
  socios,
  miSocioId,
  hoy,
  pedidaPor,
  onCerrar,
}: {
  solicitud: SolicitudEncuesta
  respuestas: RespuestaEncuesta[]
  socios: Socio[]
  miSocioId: string | null
  hoy: string
  pedidaPor: string | null
  onCerrar: () => void
}) {
  // Días hábiles de la ventana que todavía no pasaron.
  const dias = diasDeVentana(solicitud.ventana_desde, solicitud.ventana_hasta).filter(
    (f) => f >= hoy && diaSemana(f) !== 0 && diaSemana(f) !== 6
  )
  const paginas = Math.max(1, Math.ceil(dias.length / POR_PAGINA))
  const [pagina, setPagina] = useState(0)
  const visibles = dias.slice(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA)

  const mia = respuestas.find((r) => r.socio_id === miSocioId)
  const misFranjas = aIntervalos(mia)
  const [marcadas, setMarcadas] = useState<Set<string>>(() => {
    const s = new Set<string>()
    for (const f of dias) for (const h of HORAS) if (cubre(misFranjas, f, h)) s.add(clave(f, h))
    return s
  })
  const [abierto, setAbierto] = useState(true)
  const [guardado, setGuardado] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  const requeridos = socios.filter((s) => solicitud.socios_requeridos.includes(s.id))
  const otros = requeridos.filter((s) => s.id !== miSocioId)
  const franjasDe = new Map(respuestas.map((r) => [r.socio_id, aIntervalos(r)]))
  const color = new Map(otros.map((s, i) => [s.id, COLORES[i % COLORES.length]]))
  const respondio = (id: string) => respuestas.some((r) => r.socio_id === id)
  const nombre = (s: Socio) => (s.id === miSocioId ? "Vos" : s.nombre.split(" ")[0])

  function alternar(f: string, h: number) {
    setGuardado(false)
    setMarcadas((m) => {
      const sig = new Set(m)
      const k = clave(f, h)
      if (sig.has(k)) sig.delete(k)
      else sig.add(k)
      return sig
    })
  }

  function diaEntero(f: string) {
    setGuardado(false)
    setMarcadas((m) => {
      const sig = new Set(m)
      const todo = HORAS.every((h) => sig.has(clave(f, h)))
      for (const h of HORAS) {
        if (todo) sig.delete(clave(f, h))
        else sig.add(clave(f, h))
      }
      return sig
    })
  }

  // Quiénes pueden en una celda (los otros, más yo según lo marcado).
  function pueden(f: string, h: number): string[] {
    const ids = otros.filter((s) => cubre(franjasDe.get(s.id) ?? [], f, h)).map((s) => s.id)
    if (miSocioId && marcadas.has(clave(f, h))) ids.push(miSocioId)
    return ids
  }

  // Mejores huecos: celdas donde pueden todos los que respondieron (yo
  // cuento si ya marqué algo).
  const quienesCuentan = [
    ...otros.filter((s) => (franjasDe.get(s.id) ?? []).length > 0).map((s) => s.id),
    ...(miSocioId && marcadas.size > 0 ? [miSocioId] : []),
  ]
  const huecos =
    quienesCuentan.length === 0
      ? []
      : dias
          .flatMap((f) => HORAS.map((h) => ({ f, h, n: pueden(f, h).length })))
          .filter((c) => c.n === quienesCuentan.length)
          .slice(0, 3)

  const falta = marcadas.size === 0 ? "Marcá al menos un horario" : null

  function cerrar() {
    setAbierto(false)
    setTimeout(onCerrar, 200)
  }

  // Lo marcado en la grilla reemplaza las horas de 9 a 18 de los días de la
  // encuesta; lo que el socio hubiera cargado fuera de ese rango (desde la
  // ficha completa, por ejemplo a las 8 o a las 19) se conserva.
  function franjasAGuardar() {
    const grilla: Intervalo[] = dias.map((f) => ({
      inicio: instanteEnZona(f, pad(HORAS[0])),
      fin: instanteEnZona(f, pad(HORAS.at(-1)! + 1)),
    }))
    const fuera = restar(normalizar(misFranjas), normalizar(grilla))
    const nuevas: Intervalo[] = Array.from(marcadas).map((k) => {
      const [f, h] = k.split("|")
      const inicio = instanteEnZona(f, pad(Number(h)))
      return { inicio, fin: inicio + HORA }
    })
    return partirPorDia(normalizar([...fuera, ...nuevas])).map((iv) => {
      const desde = paredEnZona(iv.inicio)
      const hasta = paredEnZona(iv.fin)
      return { fecha: desde.fecha, desde: desde.hora, hasta: hasta.fecha === desde.fecha ? hasta.hora : "24:00" }
    })
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (falta || pendiente) return
    iniciarTransicion(async () => {
      const r = await guardarRespuesta(solicitud.id, franjasAGuardar())
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo guardar")
        return
      }
      if (r.agendada) toast.success(`Respondieron todos: quedó agendada para el ${r.agendada}`)
      else toast.success("Disponibilidad guardada")
      if (r.advertencia) toast.warning(r.advertencia)
      setGuardado(true)
      setTimeout(cerrar, 700)
    })
  }

  function noPuedo() {
    iniciarTransicion(async () => {
      const r = await marcarNoPuedo(solicitud.id)
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo guardar")
        return
      }
      toast.success("Listo: quedó que no podés en estos días")
      cerrar()
    })
  }

  const rango =
    dias.length > 0 ? `${etiquetaCorta(dias[0])} al ${etiquetaCorta(dias.at(-1)!)}` : "sin días hábiles por delante"

  return (
    <Popover
      open={abierto}
      onOpenChange={(v) => !v && !pendiente && cerrar()}
      aria-label={`Disponibilidad para ${solicitud.titulo}`}
      onSubmit={onSubmit}
      falta={guardado ? null : falta}
      datos={
        <>
          <div className="flex flex-col gap-3">
            <span className="zq-rotulo">Respuestas</span>
            {requeridos.map((s) => {
              const r = respondio(s.id)
              const noPuede = r && (franjasDe.get(s.id) ?? []).length === 0
              return (
                <div key={s.id} className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "inline-flex size-[30px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      r ? "bg-lima text-carbon" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {iniciales(s.nombre)}
                  </span>
                  <span className="flex-1">{nombre(s)}</span>
                  <span className={cn("text-xs", r && !noPuede ? "font-semibold text-positivo" : "text-muted-foreground")}>
                    {noPuede ? "No puede" : r ? (s.id === miSocioId ? "Respondiste" : "Respondió") : "Falta"}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="zq-rotulo">Mejores huecos</span>
            {huecos.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                Marcá tus horarios y acá aparecen los que le sirven a todos.
              </span>
            ) : (
              huecos.map((c) => (
                <div key={clave(c.f, c.h)} className="flex items-center justify-between rounded-[10px] bg-lima px-3 py-2 text-carbon">
                  <strong className="font-semibold">
                    {NOMBRES[diaSemana(c.f)]} {Number(c.f.slice(8))} · {c.h}:00
                  </strong>
                  <span className="zq-num text-xs">
                    {c.n} de {requeridos.length}
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      }
      acciones={
        <>
          <PopoverCancelar />
          <PopoverPrimario listo={!falta && !guardado} pendiente={pendiente} guardado={guardado}>
            Guardar
          </PopoverPrimario>
        </>
      }
    >
      <div className="flex flex-col gap-1.5 pr-8">
        <p className="zq-rotulo">Marcá cuándo podés</p>
        <PopoverTitulo className="text-2xl leading-[30px]">{solicitud.titulo}</PopoverTitulo>
        <span className="text-xs text-muted-foreground">
          {solicitud.duracion_min === 60 ? "1 hora" : `${solicitud.duracion_min} min`} · {rango}
          {pedidaPor && ` · pedida por ${pedidaPor}`}
        </span>
      </div>

      {dias.length === 0 ? (
        <p className="m-0 rounded-xl border border-dashed border-input p-6 text-center text-muted-foreground">
          Los días de esta encuesta ya pasaron.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {paginas > 1 && (
            <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
              <button
                type="button"
                aria-label="Días anteriores"
                disabled={pagina === 0}
                onClick={() => setPagina((p) => p - 1)}
                className="flex size-8 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30"
              >
                <ChevronLeftIcon className="size-4" />
              </button>
              {pagina + 1} de {paginas}
              <button
                type="button"
                aria-label="Días siguientes"
                disabled={pagina === paginas - 1}
                onClick={() => setPagina((p) => p + 1)}
                className="flex size-8 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30"
              >
                <ChevronRightIcon className="size-4" />
              </button>
            </div>
          )}
          <div
            role="grid"
            aria-label="Horarios"
            className="grid items-stretch gap-1.5"
            style={{ gridTemplateColumns: `44px repeat(${visibles.length}, minmax(0, 1fr))` }}
          >
            <span />
            {visibles.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => diaEntero(f)}
                title="Marcar todo el día"
                className="flex flex-col items-center rounded-lg pt-1 pb-1.5 hover:bg-muted"
              >
                <span className="text-xs text-muted-foreground">{NOMBRES[diaSemana(f)]}</span>
                <strong className="zq-num text-[15px]">{Number(f.slice(8))}</strong>
              </button>
            ))}
            {HORAS.map((h) => (
              <div key={h} className="contents">
                <span className="zq-num self-center text-xs text-muted-foreground">{h}:00</span>
                {visibles.map((f) => {
                  const on = marcadas.has(clave(f, h))
                  const ellos = otros.filter((s) => cubre(franjasDe.get(s.id) ?? [], f, h))
                  return (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${NOMBRES[diaSemana(f)]} ${Number(f.slice(8))}, ${h}:00${on ? ", podés" : ""}${ellos.length ? `, también ${ellos.map((s) => s.nombre.split(" ")[0]).join(", ")}` : ""}`}
                      onClick={() => alternar(f, h)}
                      className={cn(
                        "flex h-[34px] items-center justify-end gap-0.5 rounded-lg px-1.5",
                        on ? "bg-lima" : "border bg-card hover:border-input"
                      )}
                    >
                      {ellos.map((s) => (
                        <span key={s.id} title={s.nombre} className={cn("size-1.5 rounded-full", color.get(s.id))} />
                      ))}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3.5 rounded bg-lima" aria-hidden="true" />
              Vos podés
            </span>
            {otros.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5">
                <span className={cn("size-1.5 rounded-full", color.get(s.id))} aria-hidden="true" />
                {s.nombre.split(" ")[0]}
              </span>
            ))}
            <span>Tocá un día para marcarlo entero</span>
            <button type="button" onClick={noPuedo} disabled={pendiente} className="ml-auto font-semibold text-foreground underline underline-offset-2">
              No puedo ninguno de estos días
            </button>
          </div>
        </div>
      )}
    </Popover>
  )
}

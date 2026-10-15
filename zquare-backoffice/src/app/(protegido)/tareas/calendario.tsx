"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useEsCelular } from "@/hooks/use-mobile"
import { diaSemana, rangoMes } from "@/lib/ceremonias"
import { paredEnZona, sumarDias } from "@/lib/disponibilidad"
import { codigoSprint, TIPOS_CEREMONIA, type Ceremonia, type Sprint } from "@/lib/dominio"
import { cn } from "@/lib/utils"

import { type ProyectoOpcion } from "./campos-tarea"
import { CeremoniasSprint } from "./ceremonias-sprint"

// Ceremonia con el sprint al que pertenece (el join viene del server).
export type CeremoniaCalendario = Ceremonia & {
  sprint: Pick<Sprint, "id" | "numero" | "nombre" | "proyecto_id" | "estado">
}

// Lo que no es sprint ni ceremonia: arranques y entregas de proyectos,
// tareas que vencen y reuniones agendadas. Lo arma el server.
export type EventoCalendario = {
  fecha: string // YYYY-MM-DD en la zona de la empresa
  hora?: string
  tipo: "reunion" | "proyecto" | "tarea"
  texto: string
  href: string
}

type Capa = "reunion" | "tarea" | "proyecto" | "sprint"

const CAPAS: { capa: Capa; texto: string; muestra: string }[] = [
  { capa: "reunion", texto: "Reuniones", muestra: "bg-lima" },
  { capa: "tarea", texto: "Tareas que vencen", muestra: "bg-card ring-1 ring-input ring-inset" },
  { capa: "proyecto", texto: "Proyectos", muestra: "bg-carbon dark:bg-crema" },
  { capa: "sprint", texto: "Sprints", muestra: "bg-arena" },
]

// Chip de evento: reunión en lima, entrega o arranque de proyecto en carbón,
// tarea que vence con contorno.
const ESTILO_EVENTO: Record<EventoCalendario["tipo"], string> = {
  reunion: "bg-lima text-carbon",
  proyecto: "bg-carbon text-crema dark:bg-crema dark:text-carbon",
  tarea: "bg-card text-foreground ring-1 ring-input ring-inset",
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre",
]
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
const MAX_POR_DIA = 3

export function mesVecino(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number)
  const d = new Date(Date.UTC(a, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

// Semanas (lunes a domingo) que cubren el mes, como listas de fechas.
function semanasDelMes(mes: string): string[][] {
  const { desde, hasta } = rangoMes(mes)
  let dia = sumarDias(desde, -(diaSemana(desde) - 1))
  const fin = sumarDias(hasta, 7 - diaSemana(hasta))
  const semanas: string[][] = []
  while (dia <= fin) {
    const semana: string[] = []
    for (let i = 0; i < 7; i++) {
      semana.push(dia)
      dia = sumarDias(dia, 1)
    }
    semanas.push(semana)
  }
  return semanas
}

function hrefMes(mes: string, qs: string): string {
  const params = new URLSearchParams(qs)
  params.set("mes", mes)
  return `/tareas/calendario?${params.toString()}`
}

type Item =
  | (EventoCalendario & { clave: string })
  | { clave: string; tipo: "ceremonia"; fecha: string; hora: string; texto: string; sprint: CeremoniaCalendario["sprint"] }

export function Calendario({
  mes,
  hoy,
  sprints,
  ceremonias,
  eventos,
  qsFiltros,
}: {
  mes: string // "YYYY-MM"
  hoy: string // "YYYY-MM-DD" en la zona de la empresa (lo calcula el server)
  // Sprints con fechas que tocan el mes (cualquier estado).
  sprints: Sprint[]
  // Planning, review y retro (sin dailies).
  ceremonias: CeremoniaCalendario[]
  eventos: EventoCalendario[]
  proyectos: ProyectoOpcion[]
  // Filtros activos (cliente/proyecto/socio) para preservarlos al navegar.
  qsFiltros: string
}) {
  const esCelular = useEsCelular()
  const [sprintAbierto, setSprintAbierto] = useState<Pick<Sprint, "id"> | null>(null)
  const [capas, setCapas] = useState<Record<Capa, boolean>>({
    reunion: true,
    tarea: true,
    proyecto: true,
    sprint: true,
  })
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null)
  const mesHoy = hoy.slice(0, 7)
  const [anio, numMes] = mes.split("-").map(Number)
  const semanas = semanasDelMes(mes)

  // Eventos y ceremonias por día, ordenados por hora (los de día entero
  // primero).
  const porDia = new Map<string, Item[]>()
  const sumar = (fecha: string, item: Item) => {
    const lista = porDia.get(fecha) ?? []
    lista.push(item)
    porDia.set(fecha, lista)
  }
  if (capas.reunion) {
    for (const c of ceremonias) {
      const { fecha, hora } = paredEnZona(Date.parse(c.inicio))
      sumar(fecha, {
        clave: c.id,
        tipo: "ceremonia",
        fecha,
        hora,
        texto: `${TIPOS_CEREMONIA[c.tipo].label} ${codigoSprint(c.sprint.numero)}`,
        sprint: c.sprint,
      })
    }
  }
  eventos.forEach((e, i) => {
    const capa: Capa = e.tipo
    if (capas[capa]) sumar(e.fecha, { ...e, clave: `${e.tipo}-${i}` })
  })
  for (const lista of porDia.values()) {
    lista.sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? ""))
  }

  function sprintsDe(fecha: string): Sprint[] {
    if (!capas.sprint) return []
    return sprints
      .filter((s) => s.fecha_inicio && s.fecha_fin && s.fecha_inicio <= fecha && s.fecha_fin >= fecha)
      .sort((a, b) => a.numero - b.numero)
  }

  function chip(item: Item) {
    const texto = item.hora ? `${item.hora.replace(/^0/, "")} ${item.texto}` : item.texto
    const clase = "block truncate rounded-[5px] px-1.5 py-0.5 text-[11px] leading-[15px]"
    if (item.tipo === "ceremonia") {
      return (
        <button
          key={item.clave}
          type="button"
          title={texto}
          onClick={() => setSprintAbierto(item.sprint)}
          className={cn(clase, "text-left", ESTILO_EVENTO.reunion)}
        >
          {texto}
        </button>
      )
    }
    return (
      <Link key={item.clave} href={item.href} title={texto} className={cn(clase, ESTILO_EVENTO[item.tipo])}>
        {texto}
      </Link>
    )
  }

  function franja(fecha: string, lunes: boolean) {
    const activos = sprintsDe(fecha)
    if (activos.length === 0) return <span className="h-4 shrink-0" aria-hidden="true" />
    const empiezan = activos.filter((s) => s.fecha_inicio === fecha)
    const etiqueta = empiezan.length
      ? empiezan.map((s) => codigoSprint(s.numero)).join(" · ")
      : lunes
        ? codigoSprint(activos[activos.length - 1].numero)
        : ""
    const detalle = activos
      .map((s) => `${codigoSprint(s.numero)} (${s.fecha_inicio} → ${s.fecha_fin})`)
      .join(", ")
    return (
      <button
        type="button"
        onClick={() => setSprintAbierto(activos[0])}
        title={`${detalle}. Ver ceremonias`}
        aria-label={`${detalle}. Ver ceremonias`}
        className={cn(
          "flex h-4 shrink-0 items-center px-1.5 text-left text-[10px] leading-4 font-bold whitespace-nowrap text-carbon",
          activos.length > 1 ? "zq-franja-rayada" : "bg-arena"
        )}
      >
        {etiqueta}
      </button>
    )
  }

  const diasDelMes = semanas.flat().filter((f) => f.slice(0, 7) === mes)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            nativeButton={false}
            aria-label="Mes anterior"
            render={<Link href={hrefMes(mesVecino(mes, -1), qsFiltros)} />}
          >
            <ChevronLeftIcon />
          </Button>
          <h2 className="m-0 min-w-[180px] text-center font-display text-2xl leading-[30px] font-normal">
            {MESES[numMes - 1]} {anio}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            nativeButton={false}
            aria-label="Mes siguiente"
            render={<Link href={hrefMes(mesVecino(mes, 1), qsFiltros)} />}
          >
            <ChevronRightIcon />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          aria-disabled={mes === mesHoy || undefined}
          render={<Link href={hrefMes(mesHoy, qsFiltros)} />}
        >
          Hoy
        </Button>
        <div className="flex flex-wrap gap-1.5 escritorio:ml-auto">
          {CAPAS.map(({ capa, texto, muestra }) => (
            <button
              key={capa}
              type="button"
              aria-pressed={capas[capa]}
              onClick={() => setCapas((c) => ({ ...c, [capa]: !c[capa] }))}
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-[13px]",
                !capas[capa] && "opacity-45"
              )}
            >
              <i aria-hidden="true" className={cn("inline-block size-2.5 rounded-[3px]", muestra)} />
              {texto}
            </button>
          ))}
        </div>
      </div>

      {esCelular ? (
        // Celular: lista por día que salta los días vacíos.
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {diasDelMes
            .filter((f) => (porDia.get(f)?.length ?? 0) > 0 || sprintsDe(f).some((s) => s.fecha_inicio === f))
            .map((f) => {
              const empiezan = sprintsDe(f).filter((s) => s.fecha_inicio === f)
              return (
                <li
                  key={f}
                  className={cn(
                    "flex gap-3 rounded-xl border bg-card p-3",
                    f === hoy && "border-foreground"
                  )}
                >
                  <span className="w-11 shrink-0 text-center">
                    <span className="block text-xs text-muted-foreground">{DIAS[diaSemana(f) - 1]}</span>
                    <span className="zq-num block text-lg font-semibold">{Number(f.slice(8))}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    {empiezan.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSprintAbierto(s)}
                        className="block truncate rounded-[5px] bg-arena px-1.5 py-0.5 text-left text-[11px] leading-[15px] font-bold text-carbon"
                      >
                        Empieza {codigoSprint(s.numero)}
                      </button>
                    ))}
                    {(porDia.get(f) ?? []).map(chip)}
                  </span>
                </li>
              )
            })}
          {diasDelMes.every((f) => (porDia.get(f)?.length ?? 0) === 0) && (
            <li className="rounded-xl border border-dashed border-input p-6 text-center text-muted-foreground">
              Nada este mes.
            </li>
          )}
        </ul>
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {DIAS.map((d) => (
            <span key={d} className="px-1.5 text-xs font-semibold text-muted-foreground">
              {d}
            </span>
          ))}
          {semanas.flat().map((fecha) => {
            if (fecha.slice(0, 7) !== mes) return <div key={fecha} aria-hidden="true" />
            const dia = diaSemana(fecha)
            const finde = dia > 5
            const esHoy = fecha === hoy
            const items = porDia.get(fecha) ?? []
            const todos = diaAbierto === fecha
            const visibles = todos ? items : items.slice(0, MAX_POR_DIA)
            return (
              <div
                key={fecha}
                className={cn(
                  "flex min-h-32 flex-col gap-[3px] overflow-hidden rounded-[10px] border pb-1.5",
                  finde ? "bg-background" : "bg-card",
                  esHoy && "border-foreground"
                )}
              >
                {franja(fecha, dia === 1)}
                <span
                  className={cn(
                    "zq-num self-start px-2 py-0.5 text-[13px] font-semibold",
                    finde && "text-muted-foreground",
                    esHoy && "ml-1 rounded-full bg-foreground px-[7px] py-px text-background"
                  )}
                  aria-current={esHoy ? "date" : undefined}
                >
                  {Number(fecha.slice(8))}
                </span>
                <div className="flex min-w-0 flex-col gap-[3px] px-1">{visibles.map(chip)}</div>
                {items.length > MAX_POR_DIA && (
                  <button
                    type="button"
                    onClick={() => setDiaAbierto(todos ? null : fecha)}
                    className="self-start px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {todos ? "Menos" : `+ ${items.length - MAX_POR_DIA} más`}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {sprintAbierto && (
        <CeremoniasSprint
          sprint={sprints.find((s) => s.id === sprintAbierto.id) ?? (sprintAbierto as Sprint)}
          abierto
          onAbiertoChange={(v) => {
            if (!v) setSprintAbierto(null)
          }}
        />
      )}
    </div>
  )
}

"use client"

import { useState } from "react"
import Link from "next/link"
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, FlagIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { paredEnZona, sumarDias } from "@/lib/disponibilidad"
import { diaSemana, rangoMes } from "@/lib/ceremonias"
import {
  codigoSprint,
  TIPOS_CEREMONIA,
  type Ceremonia,
  type Sprint,
} from "@/lib/dominio"

import { type ProyectoOpcion } from "./campos-tarea"
import { CeremoniasSprint } from "./ceremonias-sprint"

// Ceremonia con el sprint al que pertenece (el join viene del server).
export type CeremoniaCalendario = Ceremonia & {
  sprint: Pick<Sprint, "id" | "numero" | "nombre" | "proyecto_id" | "estado">
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]
const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]

// Colores por tipo de ceremonia: la daily es ruido de fondo (gris), las otras
// tres son los hitos del sprint y se distinguen entre sí.
const COLOR_TIPO: Record<keyof typeof TIPOS_CEREMONIA, string> = {
  planning: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100",
  daily: "bg-muted text-muted-foreground",
  review: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  retro: "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100",
}

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
  params.set("vista", "calendario")
  params.set("mes", mes)
  return `/tareas?${params.toString()}`
}

export function Calendario({
  mes,
  hoy,
  sprints,
  ceremonias,
  proyectos,
  qsFiltros,
}: {
  mes: string // "YYYY-MM"
  hoy: string // "YYYY-MM-DD" en la zona de la empresa (lo calcula el server)
  // Sprints con fechas que tocan el mes (cualquier estado).
  sprints: Sprint[]
  ceremonias: CeremoniaCalendario[]
  proyectos: ProyectoOpcion[]
  // Filtros activos (cliente/proyecto/socio) para preservarlos al navegar.
  qsFiltros: string
}) {
  const [sprintAbierto, setSprintAbierto] = useState<Sprint | null>(null)
  const mesHoy = hoy.slice(0, 7)
  const [anio, numMes] = mes.split("-").map(Number)
  const semanas = semanasDelMes(mes)
  const nombreProyecto = new Map(proyectos.map((p) => [p.id, p.nombre]))

  const porDia = new Map<string, CeremoniaCalendario[]>()
  for (const c of ceremonias) {
    const { fecha } = paredEnZona(Date.parse(c.inicio))
    const lista = porDia.get(fecha) ?? []
    lista.push(c)
    porDia.set(fecha, lista)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-medium capitalize">
          {MESES[numMes - 1]} {anio}
        </h2>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            nativeButton={false}
            aria-label="Mes anterior"
            render={<Link href={hrefMes(mesVecino(mes, -1), qsFiltros)} />}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            disabled={mes === mesHoy}
            render={<Link href={hrefMes(mesHoy, qsFiltros)} />}
          >
            Hoy
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            nativeButton={false}
            aria-label="Mes siguiente"
            render={<Link href={hrefMes(mesVecino(mes, 1), qsFiltros)} />}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[720px] overflow-hidden rounded-xl border">
          <div className="grid grid-cols-7 border-b bg-muted/40 text-xs text-muted-foreground">
            {DIAS.map((d) => (
              <div key={d} className="px-2 py-1.5 font-medium">
                {d}
              </div>
            ))}
          </div>

          {semanas.map((semana, i) => {
            const lunes = semana[0]
            const domingo = semana[6]
            // Sprints que tocan esta semana: una barra por sprint, recortada
            // a lunes–domingo. El orden por número mantiene las barras
            // estables de una semana a la otra.
            const barras = sprints
              .filter(
                (s) =>
                  s.fecha_inicio &&
                  s.fecha_fin &&
                  s.fecha_inicio <= domingo &&
                  s.fecha_fin >= lunes
              )
              .sort((a, b) => a.numero - b.numero)
            return (
              <div key={lunes} className={cn("border-b last:border-b-0", i > 0 && "")}>
                {barras.length > 0 && (
                  <div className="grid grid-cols-7 gap-y-1 px-1 pt-1">
                    {barras.map((s) => {
                      const desde = s.fecha_inicio! < lunes ? 1 : diaSemana(s.fecha_inicio!)
                      const hasta = s.fecha_fin! > domingo ? 7 : diaSemana(s.fecha_fin!)
                      const empieza = s.fecha_inicio! >= lunes
                      const termina = s.fecha_fin! <= domingo
                      const proyecto = s.proyecto_id ? nombreProyecto.get(s.proyecto_id) : null
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSprintAbierto(s)}
                          title={`${s.nombre}${proyecto ? ` · ${proyecto}` : ""} — ${s.fecha_inicio} → ${s.fecha_fin}. Click: ceremonias`}
                          style={{ gridColumn: `${desde} / ${hasta + 1}` }}
                          className={cn(
                            "flex h-6 min-w-0 cursor-pointer items-center gap-1.5 truncate px-2 text-xs transition-colors",
                            empieza ? "ml-1 rounded-l-md" : "",
                            termina ? "mr-1 rounded-r-md" : "",
                            s.estado === "activo" &&
                              "bg-primary text-primary-foreground hover:bg-primary/90",
                            s.estado === "planificado" &&
                              "border border-dashed border-primary/60 bg-background text-foreground hover:bg-muted",
                            s.estado === "cerrado" &&
                              "bg-muted text-muted-foreground hover:bg-muted/70"
                          )}
                        >
                          <FlagIcon className="size-3 shrink-0" />
                          <span className="truncate">
                            {s.nombre}
                            {s.nombre !== codigoSprint(s.numero) && (
                              <span className="opacity-70"> · {codigoSprint(s.numero)}</span>
                            )}
                            {proyecto && <span className="opacity-70"> · {proyecto}</span>}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
                <div className="grid grid-cols-7">
                  {semana.map((fecha) => {
                    const delMes = fecha.slice(0, 7) === mes
                    const esHoy = fecha === hoy
                    const items = (porDia.get(fecha) ?? []).sort((a, b) =>
                      a.inicio.localeCompare(b.inicio)
                    )
                    return (
                      <div
                        key={fecha}
                        className={cn(
                          "flex min-h-24 flex-col gap-1 border-r p-1 last:border-r-0",
                          !delMes && "bg-muted/20"
                        )}
                      >
                        <span
                          className={cn(
                            "self-end rounded-full px-1.5 text-xs tabular-nums",
                            !delMes && "text-muted-foreground/60",
                            esHoy && "bg-primary font-medium text-primary-foreground"
                          )}
                        >
                          {Number(fecha.slice(8))}
                        </span>
                        {items.map((c) => {
                          const { hora } = paredEnZona(Date.parse(c.inicio))
                          const proyecto = c.sprint.proyecto_id
                            ? nombreProyecto.get(c.sprint.proyecto_id)
                            : null
                          return (
                            <span
                              key={c.id}
                              title={`${TIPOS_CEREMONIA[c.tipo].label} · ${c.sprint.nombre}${proyecto ? ` · ${proyecto}` : ""} — ${hora}, ${c.duracion_min} min`}
                              className={cn(
                                "flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] leading-4",
                                COLOR_TIPO[c.tipo]
                              )}
                            >
                              <span className="font-mono tabular-nums">{hora}</span>
                              <span className="truncate">
                                {TIPOS_CEREMONIA[c.tipo].label}
                                {sprints.length > 1 && (
                                  <span className="opacity-70"> · {codigoSprint(c.sprint.numero)}</span>
                                )}
                              </span>
                            </span>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {sprints.length === 0 && ceremonias.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDaysIcon className="size-4" />
          Ningún sprint con fechas toca este mes. Las fechas se cargan al crear
          o iniciar el sprint; las ceremonias, desde el menú del sprint (⋯ →
          Ceremonias) o haciendo click en su barra acá.
        </p>
      )}

      {sprintAbierto && (
        <CeremoniasSprint
          sprint={sprintAbierto}
          abierto
          onAbiertoChange={(v) => {
            if (!v) setSprintAbierto(null)
          }}
        />
      )}
    </div>
  )
}

import Image from "next/image"
import Link from "next/link"
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Encabezado } from "@/components/zq/encabezado"
import { paredEnZona, sumarDias } from "@/lib/disponibilidad"
import { type Cliente, type SolicitudReunion, type Socio } from "@/lib/dominio"
import { fechaCorta } from "@/lib/formato"
import { CAMPOS_SOLICITUD, fechaDeHoy } from "@/lib/reuniones"
import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

import { Encuesta, type RespuestaEncuesta } from "./encuesta"
import { FormularioSolicitud, NuevaSolicitud } from "./nueva-solicitud"

export const metadata = { title: "Reuniones" }

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie"]
const DIAS_LARGOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"]
// La agenda va de 9 a 18, en medias horas.
const HORA_INICIO = 9
const HORA_FIN = 18
const FILAS = (HORA_FIN - HORA_INICIO) * 2

function lunesDe(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`).getUTCDay()
  return sumarDias(fecha, -((d + 6) % 7))
}

function minutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number)
  return h * 60 + m
}

// "12 – 16 de octubre" (o "29 de setiembre – 3 de octubre").
function rotuloSemana(lunes: string): string {
  const viernes = sumarDias(lunes, 4)
  const [, m1, d1] = lunes.split("-").map(Number)
  const [, m2, d2] = viernes.split("-").map(Number)
  return m1 === m2 ? `${d1} – ${d2} de ${MESES[m2 - 1]}` : `${d1} de ${MESES[m1 - 1]} – ${d2} de ${MESES[m2 - 1]}`
}

function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join("")
  return `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`
}

export default async function ReunionesPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>
}) {
  const { semana } = await searchParams
  const supabase = await createClient()
  const [socioId, hoy] = await Promise.all([idSocioActual(), fechaDeHoy()])

  const [
    { data: solicitudesData },
    { data: respuestasData },
    { data: sociosData },
    { data: clientesData },
    { data: proyectosData },
  ] = await Promise.all([
    supabase.from("solicitudes_reunion").select(CAMPOS_SOLICITUD).is("deleted_at", null),
    supabase.from("reunion_respuestas").select("solicitud_id, socio_id, franjas"),
    supabase.from("socios").select("id, nombre, email").is("deleted_at", null).order("nombre"),
    supabase.from("clientes").select("id, nombre, email").is("deleted_at", null).order("nombre"),
    supabase.from("proyectos").select("id, nombre, cliente_id").is("deleted_at", null).order("nombre"),
  ])

  const solicitudes = (solicitudesData ?? []) as SolicitudReunion[]
  const socios = (sociosData ?? []) as Socio[]
  const clientes = (clientesData ?? []) as Pick<Cliente, "id" | "nombre" | "email">[]
  const proyectos = (proyectosData ?? []) as { id: string; nombre: string; cliente_id: string | null }[]
  const respuestas = (respuestasData ?? []) as (RespuestaEncuesta & { solicitud_id: string })[]
  const nombreSocio = new Map(socios.map((s) => [s.id, s.nombre.split(" ")[0]]))
  const catalogos = { socios, clientes, proyectos }

  const lunes = semana && /^\d{4}-\d{2}-\d{2}$/.test(semana) ? lunesDe(semana) : lunesDe(hoy)
  const viernes = sumarDias(lunes, 4)
  const diasSemana = [0, 1, 2, 3, 4].map((i) => sumarDias(lunes, i))

  // Reuniones agendadas de esta semana, ubicadas en la grilla.
  const agendadas = solicitudes
    .filter((s) => s.estado === "agendada" && s.inicio)
    .map((s) => {
      const ini = paredEnZona(Date.parse(s.inicio!))
      const fin = s.fin ? paredEnZona(Date.parse(s.fin)) : null
      const desde = minutos(ini.hora)
      const hasta = fin && fin.fecha === ini.fecha ? minutos(fin.hora) : desde + s.duracion_min
      return { s, fecha: ini.fecha, hora: ini.hora, desde, hasta }
    })
    .sort((a, b) => (a.s.inicio ?? "").localeCompare(b.s.inicio ?? ""))
  const enSemana = agendadas.filter((e) => e.fecha >= lunes && e.fecha <= viernes)
  const masAdelante = agendadas.filter((e) => e.fecha > viernes).slice(0, 5)

  // Encuestas abiertas: las que tocan la semana van como franja punteada.
  const abiertas = solicitudes
    .filter((s) => s.estado === "abierta")
    .sort((a, b) => a.ventana_desde.localeCompare(b.ventana_desde))
  const abiertasEnSemana = abiertas.filter((s) => s.ventana_desde <= viernes && s.ventana_hasta >= lunes)

  const respondieron = (s: SolicitudReunion) =>
    s.socios_requeridos.filter((id) => respuestas.some((r) => r.solicitud_id === s.id && r.socio_id === id))
  const vacia = enSemana.length === 0 && abiertasEnSemana.length === 0

  const hrefSemana = (f: string) => `/reuniones?semana=${f}`

  return (
    <>
      <Encabezado
        titulo="Reuniones"
        acciones={<NuevaSolicitud {...catalogos} hoy={hoy} escucharCrear />}
      />

      <div className="flex flex-wrap items-center gap-1">
        <Button variant="ghost" size="icon" nativeButton={false} aria-label="Semana anterior" render={<Link href={hrefSemana(sumarDias(lunes, -7))} />}>
          <ChevronLeftIcon />
        </Button>
        <span className="px-1.5 font-semibold">{rotuloSemana(lunes)}</span>
        <Button variant="ghost" size="icon" nativeButton={false} aria-label="Semana siguiente" render={<Link href={hrefSemana(sumarDias(lunes, 7))} />}>
          <ChevronRightIcon />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="ml-1.5"
          nativeButton={false}
          aria-disabled={lunes === lunesDe(hoy) || undefined}
          render={<Link href="/reuniones" />}
        >
          Hoy
        </Button>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        {/* Escritorio: agenda de lunes a viernes, de 9 a 18. */}
        <section
          aria-label="Agenda de la semana"
          className="relative min-w-0 flex-[1_1_640px] overflow-x-auto rounded-xl border bg-card p-4 max-escritorio:hidden"
        >
          <div
            className="grid min-w-[620px] gap-x-1.5"
            style={{
              gridTemplateColumns: "52px repeat(5, minmax(110px, 1fr))",
              gridTemplateRows: `44px ${abiertasEnSemana.map(() => "30px").join(" ")} repeat(${FILAS}, 28px)`,
            }}
          >
            {diasSemana.map((f, i) => (
              <div key={f} className="flex items-baseline gap-1.5 px-2 py-1" style={{ gridColumn: i + 2, gridRow: 1 }}>
                <span className="text-xs text-muted-foreground">{DIAS[i]}</span>
                <span
                  className={cn(
                    "zq-num text-[15px] font-bold",
                    f === hoy && "inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-full bg-foreground text-background"
                  )}
                  aria-current={f === hoy ? "date" : undefined}
                >
                  {Number(f.slice(8))}
                </span>
              </div>
            ))}

            {abiertasEnSemana.map((s, n) => {
              const desde = Math.max(0, diasSemana.indexOf(s.ventana_desde < lunes ? lunes : s.ventana_desde))
              const hastaF = s.ventana_hasta > viernes ? viernes : s.ventana_hasta
              const hasta = diasSemana.indexOf(hastaF) === -1 ? 4 : diasSemana.indexOf(hastaF)
              return (
                <Link
                  key={s.id}
                  href={`/reuniones/${s.id}`}
                  title={`Encuesta abierta: ${s.titulo}`}
                  className="mt-0.5 mb-1 flex min-w-0 items-center truncate rounded-md border border-dashed border-input bg-card px-2 text-xs font-semibold text-foreground no-underline"
                  style={{ gridColumn: `${desde + 2} / ${hasta + 3}`, gridRow: n + 2 }}
                >
                  <span className="truncate">Encuesta · {s.titulo}</span>
                </Link>
              )
            })}

            {Array.from({ length: HORA_FIN - HORA_INICIO }, (_, h) => (
              <span
                key={h}
                className="zq-num pt-0.5 text-xs text-muted-foreground"
                style={{ gridColumn: 1, gridRow: `${abiertasEnSemana.length + 2 + h * 2} / span 2` }}
              >
                {HORA_INICIO + h}:00
              </span>
            ))}
            {diasSemana.flatMap((f, d) =>
              Array.from({ length: FILAS }, (_, r) => (
                <div
                  key={`${f}-${r}`}
                  aria-hidden="true"
                  className={cn(r % 2 === 0 ? "border-t" : "border-t border-dashed", f === hoy && "bg-muted")}
                  style={{ gridColumn: d + 2, gridRow: abiertasEnSemana.length + 2 + r }}
                />
              ))
            )}

            {enSemana.map((e) => {
              const d = diasSemana.indexOf(e.fecha)
              const ini = Math.max(e.desde, HORA_INICIO * 60)
              const fin = Math.min(Math.max(e.hasta, ini + 30), HORA_FIN * 60)
              if (d < 0 || ini >= HORA_FIN * 60) return null
              const filaIni = abiertasEnSemana.length + 2 + Math.floor((ini - HORA_INICIO * 60) / 30)
              const filaFin = abiertasEnSemana.length + 2 + Math.ceil((fin - HORA_INICIO * 60) / 30)
              const corta = fin - ini <= 60
              const conCliente = Boolean(e.s.cliente_id)
              return (
                <Link
                  key={e.s.id}
                  href={`/reuniones/${e.s.id}`}
                  title={`${e.s.titulo} · ${e.hora}`}
                  className={cn(
                    "z-[1] my-0.5 flex min-w-0 overflow-hidden rounded-md px-2 no-underline",
                    conCliente ? "bg-lima text-carbon" : "bg-carbon text-crema dark:bg-crema dark:text-carbon",
                    corta ? "flex-row-reverse items-center justify-end gap-1.5" : "flex-col gap-0.5 py-1.5"
                  )}
                  style={{ gridColumn: d + 2, gridRow: `${filaIni} / ${filaFin}` }}
                >
                  <span className={cn("min-w-0 text-xs leading-4 font-bold", corta && "truncate")}>{e.s.titulo}</span>
                  <span className="zq-num shrink-0 text-[11px] leading-4 opacity-80">{e.hora.replace(/^0/, "")}</span>
                </Link>
              )
            })}
          </div>

          {vacia && (
            <div className="absolute inset-x-4 top-16 bottom-4 flex items-center justify-center">
              <div className="flex max-w-[360px] flex-col items-center gap-3 rounded-xl border bg-card px-9 py-7 text-center shadow-[var(--sombra-flotante)]">
                <Image src="/marca/mascota-cafe.svg" alt="" width={110} height={96} />
                <h2 className="m-0 font-display text-[22px] leading-7 font-normal">Semana sin reuniones</h2>
                <p className="m-0 text-muted-foreground">
                  Abrí una encuesta y cada socio marca cuándo puede. Después agendás sobre los huecos libres.
                </p>
                <FormularioSolicitud
                  {...catalogos}
                  hoy={hoy}
                  trigger={
                    <Button variant="outline" size="sm">
                      <PlusIcon data-icon="inline-start" />
                      Coordinar una reunión
                    </Button>
                  }
                />
              </div>
            </div>
          )}
        </section>

        {/* Celular: lista por día que salta los días vacíos. */}
        <ul className="m-0 flex w-full list-none flex-col gap-2.5 p-0 escritorio:hidden">
          {diasSemana
            .filter((f) => enSemana.some((e) => e.fecha === f))
            .map((f) => (
              <li key={f} className={cn("flex flex-col gap-2 rounded-xl border bg-card p-3.5", f === hoy && "border-foreground")}>
                <span className="text-xs font-semibold text-muted-foreground">
                  {f === hoy ? "Hoy" : DIAS_LARGOS[new Date(`${f}T12:00:00Z`).getUTCDay()]} {Number(f.slice(8))}
                </span>
                {enSemana
                  .filter((e) => e.fecha === f)
                  .map((e) => (
                    <Link
                      key={e.s.id}
                      href={`/reuniones/${e.s.id}`}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-3 py-2.5 no-underline",
                        e.s.cliente_id ? "bg-lima text-carbon" : "bg-carbon text-crema dark:bg-crema dark:text-carbon"
                      )}
                    >
                      <span className="zq-num text-xs opacity-80">{e.hora}</span>
                      <span className="truncate font-semibold">{e.s.titulo}</span>
                    </Link>
                  ))}
              </li>
            ))}
          {enSemana.length === 0 && (
            <li className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-input p-6 text-center text-muted-foreground">
              <Image src="/marca/mascota-cafe.svg" alt="" width={80} height={70} />
              Semana sin reuniones agendadas.
            </li>
          )}
        </ul>

        <aside className="flex min-w-[240px] flex-[0_1_300px] flex-col gap-4 max-escritorio:order-first max-escritorio:w-full max-escritorio:flex-auto">
          <section className="flex flex-col gap-3 rounded-xl border bg-card px-[18px] py-4">
            <h2 className="m-0 text-[15px] font-semibold">Encuestas abiertas</h2>
            {abiertas.length === 0 ? (
              <p className="m-0 text-muted-foreground">No hay encuestas abiertas.</p>
            ) : (
              abiertas.map((s) => {
                const ya = respondieron(s)
                const faltan = s.socios_requeridos
                  .filter((id) => !ya.includes(id))
                  .map((id) => (id === socioId ? "vos" : (nombreSocio.get(id) ?? "?")))
                const soyRequerido = Boolean(socioId && s.socios_requeridos.includes(socioId))
                const meFalta = soyRequerido && !ya.includes(socioId!)
                return (
                  <div key={s.id} className="flex flex-col gap-1.5 border-t pt-3 first-of-type:border-t-0 first-of-type:pt-0">
                    <Link href={`/reuniones/${s.id}`} className="font-semibold text-foreground">
                      {s.titulo}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {ya.length} de {s.socios_requeridos.length} respondieron
                      {faltan.length > 0 && ` · ${faltan.length === 1 ? "falta" : "faltan"} ${enumerar(faltan)}`}
                    </span>
                    {soyRequerido && (
                      <Encuesta
                        solicitud={s}
                        respuestas={respuestas.filter((r) => r.solicitud_id === s.id)}
                        socios={socios}
                        miSocioId={socioId}
                        hoy={hoy}
                        pedidaPor={s.created_by ? (nombreSocio.get(s.created_by) ?? null) : null}
                        etiqueta={meFalta ? "Marcar mi disponibilidad" : "Cambiar mi disponibilidad"}
                        variante={meFalta ? "default" : "outline"}
                      />
                    )}
                  </div>
                )
              })
            )}
          </section>

          {masAdelante.length > 0 && (
            <section className="flex flex-col gap-2 rounded-xl border bg-card px-[18px] py-4">
              <h2 className="m-0 text-[15px] font-semibold">Más adelante</h2>
              {masAdelante.map((e) => (
                <Link key={e.s.id} href={`/reuniones/${e.s.id}`} className="flex gap-3 text-foreground no-underline hover:underline">
                  <span className="zq-num w-20 shrink-0 text-xs leading-5 text-muted-foreground">
                    {fechaCorta(e.fecha, hoy)} {e.hora}
                  </span>
                  <span className="truncate">{e.s.titulo}</span>
                </Link>
              ))}
            </section>
          )}

          <section className="flex flex-col gap-2 px-1 text-[13px] text-muted-foreground max-escritorio:hidden">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="size-3 rounded-[3px] bg-lima" />
              Con cliente
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="size-3 rounded-[3px] bg-carbon dark:bg-crema" />
              Interna
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="size-3 rounded-[3px] border border-dashed border-input" />
              Encuesta abierta
            </span>
          </section>
        </aside>
      </div>
    </>
  )
}

import { Suspense } from "react"
import Image from "next/image"
import Link from "next/link"

import { BusquedaGlobal } from "@/components/busqueda-global"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  codigoSprint,
  codigoTarea,
  ESTADOS_PROYECTO,
  ESTADOS_TAREA,
  type EstadoProyecto,
  type EstadoTarea,
  type PrioridadTarea,
  type Sprint,
} from "@/lib/dominio"
import { paredEnZona } from "@/lib/disponibilidad"
import { hoyUruguay } from "@/lib/finanzas"
import { diasHasta, fechaCorta, formatearNumero, tonoVencimiento, vencimiento } from "@/lib/formato"
import { solicitudesACoordinar } from "@/lib/reuniones"
import { socioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"
import { NOMBRE_FUNCION } from "@/lib/uso-api"
import { resumenUsoApi } from "@/lib/uso-api-resumen"
import { cn } from "@/lib/utils"

import { AgendaHoy } from "./agenda-hoy"
import { BadgeEstadoProyecto, BarraAvance, faltaPara } from "./proyectos/ui"
import { CompletarSprint } from "./tareas/sprints"
import { resumirSprint } from "./tareas/resumen"

const CAMPOS_TAREA =
  "id, numero, titulo, estado, prioridad, asignado_a, fecha_limite, sprint_id, cliente_id, proyecto_id, estimacion"

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"]

type TareaInicio = {
  id: string
  numero: number
  titulo: string
  estado: EstadoTarea
  prioridad: PrioridadTarea
  asignado_a: string | null
  fecha_limite: string | null
  sprint_id: string | null
  cliente_id: string | null
  proyecto_id: string | null
  estimacion: number | null
}

type Alerta = {
  clave: string
  cuando: string
  tono: "negativo" | "aviso" | null
  titulo: string
  detalle: string
  accion: React.ReactNode
}

// Fuera del componente por la regla de pureza del render: el "ahora" del
// request es justo lo que se quiere.
function saludo(): string {
  const hora = Number(paredEnZona(Date.now()).hora.slice(0, 2))
  return hora < 12 ? "Buen día" : hora < 20 ? "Buenas tardes" : "Buenas noches"
}

// Inicio · "Mi día": lo que tiene que atender quien entra, sus tareas del
// sprint, su agenda y sus proyectos. Los números de la empresa viven en
// Finanzas.
export default async function InicioPage() {
  const supabase = await createClient()
  const socio = await socioActual()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [
    { data: sprintsData },
    { data: tareasData },
    { data: proyectosData },
    { data: clientesData },
    aCoordinar,
    usoApi,
  ] = await Promise.all([
    supabase.from("sprints").select("*").neq("estado", "cerrado").is("deleted_at", null),
    supabase
      .from("tareas")
      .select(CAMPOS_TAREA)
      .is("deleted_at", null)
      .neq("estado", "hecho"),
    supabase
      .from("proyectos")
      .select("id, nombre, estado, responsable_id, fecha_fin_estimada, clientes(nombre)")
      .is("deleted_at", null),
    supabase.from("clientes").select("id, nombre").is("deleted_at", null),
    socio ? solicitudesACoordinar(socio.id) : Promise.resolve([]),
    resumenUsoApi(),
  ])

  const hoy = hoyUruguay()
  const [anio, mes, dia] = hoy.split("-").map(Number)
  const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()
  const fechaLarga = `${DIAS[diaSemana]} ${dia} de ${MESES[mes - 1]}`
  const nombre = socio?.nombre.split(" ")[0] ?? user?.email?.split("@")[0] ?? "socio"

  const sprints = (sprintsData ?? []) as Sprint[]
  const activo = sprints.find((s) => s.estado === "activo") ?? null
  const planificados = sprints.filter((s) => s.estado === "planificado")
  const tareas = (tareasData ?? []) as TareaInicio[]
  const nombreCliente = new Map(((clientesData ?? []) as { id: string; nombre: string }[]).map((c) => [c.id, c.nombre]))
  const proyectos = (proyectosData ?? []) as unknown as {
    id: string
    nombre: string
    estado: EstadoProyecto
    responsable_id: string | null
    fecha_fin_estimada: string | null
    clientes: { nombre: string } | null
  }[]

  // El sprint activo completo (con las hechas), para el avance.
  const delSprint = activo
    ? (((
        await supabase.from("tareas").select(CAMPOS_TAREA).eq("sprint_id", activo.id).is("deleted_at", null)
      ).data ?? []) as TareaInicio[])
    : []
  const resumenSprint = resumirSprint(delSprint)
  const abiertas = tareas.filter((t) => t.estado !== "hecho")
  const mias = socio ? abiertas.filter((t) => t.asignado_a === socio.id) : []

  // ── Para atender hoy ──
  const alertas: Alerta[] = []
  if (activo?.fecha_fin && diasHasta(activo.fecha_fin, hoy) < 0) {
    alertas.push({
      clave: "sprint",
      cuando: vencimiento(activo.fecha_fin, hoy),
      tono: "negativo",
      titulo: `Cerrar el ${codigoSprint(activo.numero)}`,
      detalle: `Terminó el ${fechaCorta(activo.fecha_fin, hoy)} con ${resumenSprint.hechas} de ${resumenSprint.total} tarjetas hechas.`,
      accion: (
        <CompletarSprint sprint={activo} resumen={resumenSprint} sprintsPlanificados={planificados} variante="ghost" />
      ),
    })
  }
  for (const p of proyectos) {
    if (p.estado !== "en_curso" || !p.fecha_fin_estimada) continue
    if (socio && p.responsable_id && p.responsable_id !== socio.id) continue
    const n = diasHasta(p.fecha_fin_estimada, hoy)
    if (n > 7) continue
    const f = faltaPara(p.fecha_fin_estimada)
    alertas.push({
      clave: `proyecto-${p.id}`,
      cuando: f.texto,
      tono: n < 0 ? "negativo" : "aviso",
      titulo: `Entrega estimada de ${p.nombre}`,
      detalle: `${p.clientes?.nombre ?? "Interno"} · fin estimado ${fechaCorta(p.fecha_fin_estimada, hoy)}`,
      accion: <AccionLink href={`/proyectos/${p.id}`}>Ver proyecto</AccionLink>,
    })
  }
  for (const t of mias) {
    if (!t.fecha_limite || diasHasta(t.fecha_limite, hoy) > 3) continue
    alertas.push({
      clave: `tarea-${t.id}`,
      cuando: vencimiento(t.fecha_limite, hoy).replace(/ · en \d+ días$/, ""),
      tono: tonoVencimiento(t.fecha_limite, hoy),
      titulo: `${codigoTarea(t.numero)} · ${t.titulo}`,
      detalle: `${t.cliente_id ? (nombreCliente.get(t.cliente_id) ?? "Cliente") : "Interna"} · ${ESTADOS_TAREA[t.estado].label.toLowerCase()}`,
      accion: <AccionLink href={`/tareas?tarea=${codigoTarea(t.numero)}`}>Abrir</AccionLink>,
    })
  }
  for (const c of aCoordinar.filter((c) => c.meFalta)) {
    alertas.push({
      clave: `reunion-${c.solicitud.id}`,
      cuando: "Te falta",
      tono: "aviso",
      titulo: `Marcar tu disponibilidad: ${c.solicitud.titulo}`,
      detalle: `${c.respondieron} de ${c.requeridos} respondieron`,
      accion: <AccionLink href={`/reuniones/${c.solicitud.id}`}>Responder</AccionLink>,
    })
  }
  for (const t of delSprint.filter((t) => !t.asignado_a && t.estado !== "hecho").slice(0, 3)) {
    alertas.push({
      clave: `sin-resp-${t.id}`,
      cuando: "Sprint activo",
      tono: null,
      titulo: `${codigoTarea(t.numero)} sin responsable`,
      detalle: t.titulo,
      accion: <AccionLink href={`/tareas?tarea=${codigoTarea(t.numero)}`}>Asignar</AccionLink>,
    })
  }
  const peso = { negativo: 0, aviso: 1, null: 2 } as const
  alertas.sort((a, b) => peso[`${a.tono}` as keyof typeof peso] - peso[`${b.tono}` as keyof typeof peso])

  // ── Mis tareas del sprint activo (o, sin sprint, mis abiertas del tablero) ──
  const ORDEN: EstadoTarea[] = ["en_revision", "en_curso", "por_hacer", "backlog"]
  const misTareas = (activo ? mias.filter((t) => t.sprint_id === activo.id) : mias.filter((t) => t.estado !== "backlog"))
    .sort((a, b) => ORDEN.indexOf(a.estado) - ORDEN.indexOf(b.estado))

  // ── Mis proyectos ──
  const misProyectos = proyectos.filter(
    (p) => socio && p.responsable_id === socio.id && (p.estado === "en_curso" || p.estado === "mantenimiento")
  )

  // ── La empresa: proyectos por estado ──
  const porEstado = (Object.keys(ESTADOS_PROYECTO) as EstadoProyecto[])
    .map((estado) => ({ estado, n: proyectos.filter((p) => p.estado === estado).length }))
    .filter((e) => e.n > 0)

  return (
    <>
      <header className="zq-encabezado">
        <div className="flex items-center gap-5">
          <Image src="/marca/zquare-isotipo-lima.svg" alt="" width={40} height={45} className="shrink-0" />
          <div className="flex flex-col gap-0.5">
            <p className="zq-rotulo">{fechaLarga}</p>
            <h1 className="zq-encabezado-titulo">
              {saludo()}, {nombre}
            </h1>
          </div>
        </div>
        <BusquedaGlobal className="h-9 w-full bg-card text-muted-foreground escritorio:w-[260px]" />
      </header>

      <div className="flex flex-wrap items-start gap-5">
        {/* Columna principal */}
        <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-5">
          <section aria-labelledby="atender" className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-baseline gap-2 px-6 pt-5 pb-2">
              <h2 id="atender" className="m-0 text-base font-semibold">
                Para atender hoy
              </h2>
              <span className="zq-num text-muted-foreground">{alertas.length}</span>
            </div>
            {alertas.length === 0 ? (
              <p className="m-0 px-6 pb-5 text-muted-foreground">Nada urgente. Buen momento para avanzar una tarea.</p>
            ) : (
              <ul className="m-0 list-none px-3 pb-3">
                {alertas.map((a) => (
                  <li key={a.clave} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg p-3">
                    <span
                      className={cn(
                        "w-[104px] shrink-0 text-xs leading-4 font-semibold",
                        a.tono === "negativo" ? "text-negativo" : a.tono === "aviso" ? "text-aviso" : "text-muted-foreground"
                      )}
                    >
                      {a.cuando}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-medium">{a.titulo}</span>
                      <span className="truncate text-[13px] text-muted-foreground">{a.detalle}</span>
                    </span>
                    <span className="shrink-0">{a.accion}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="mistareas" className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
              <h2 id="mistareas" className="m-0 text-base font-semibold">
                Mis tareas
                {activo && <span className="ml-2 text-sm font-normal text-muted-foreground">{codigoSprint(activo.numero)}</span>}
              </h2>
              <Link href="/tareas" className="text-sm font-semibold whitespace-nowrap">
                Ir al tablero →
              </Link>
            </div>
            {misTareas.length === 0 ? (
              <p className="m-0 border-t px-6 py-4 text-muted-foreground">
                {activo ? "No tenés tareas asignadas en el sprint activo." : "No tenés tareas abiertas en el tablero."}
              </p>
            ) : (
              <ul className="m-0 list-none p-0">
                {misTareas.map((t) => (
                  <li key={t.id} className="border-t">
                    <Link
                      href={`/tareas?tarea=${codigoTarea(t.numero)}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3.5 text-foreground no-underline hover:bg-muted"
                    >
                      <span className="zq-num w-14 text-xs text-muted-foreground">{codigoTarea(t.numero)}</span>
                      <span className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
                        <span className="font-semibold">{t.titulo}</span>
                        <span className="text-xs text-muted-foreground">
                          {t.cliente_id ? (nombreCliente.get(t.cliente_id) ?? "Cliente") : "Interna"} · Prioridad {t.prioridad}
                        </span>
                      </span>
                      <span className="rounded-full bg-muted px-2.5 text-xs leading-[22px] font-semibold">
                        {ESTADOS_TAREA[t.estado].label}
                      </span>
                      {t.fecha_limite && (
                        <span
                          className={cn(
                            "zq-num w-32 text-right text-xs font-semibold",
                            tonoVencimiento(t.fecha_limite, hoy) === "negativo"
                              ? "text-negativo"
                              : tonoVencimiento(t.fecha_limite, hoy) === "aviso"
                                ? "text-aviso"
                                : "text-muted-foreground"
                          )}
                        >
                          {vencimiento(t.fecha_limite, hoy)}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Columna lateral */}
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
          <section aria-labelledby="agenda" className="flex flex-col gap-3 rounded-xl border bg-card px-6 py-5">
            <h2 id="agenda" className="m-0 text-base font-semibold">
              Agenda
            </h2>
            {user?.email ? (
              <Suspense fallback={<Skeleton className="h-14 w-full" />}>
                <AgendaHoy email={user.email} />
              </Suspense>
            ) : null}
          </section>

          <section aria-labelledby="misproyectos" className="flex flex-col gap-3 rounded-xl border bg-card px-6 py-5">
            <h2 id="misproyectos" className="m-0 text-base font-semibold">
              Mis proyectos
            </h2>
            {misProyectos.length === 0 ? (
              <p className="m-0 text-muted-foreground">No sos responsable de ningún proyecto en curso.</p>
            ) : (
              misProyectos.map((p) => {
                const delProyecto = delSprint.filter((t) => t.proyecto_id === p.id)
                const hechas = delProyecto.filter((t) => t.estado === "hecho").length
                const n = p.fecha_fin_estimada ? diasHasta(p.fecha_fin_estimada, hoy) : null
                return (
                  <Link key={p.id} href={`/proyectos/${p.id}`} className="flex flex-col gap-2 border-t pt-3 text-foreground no-underline first-of-type:border-t-0 first-of-type:pt-0">
                    <span className="flex items-start justify-between gap-3">
                      <span>
                        <span className="block font-semibold">{p.nombre}</span>
                        <span className="block text-xs text-muted-foreground">
                          {p.clientes?.nombre ?? "Interno"}
                          {p.fecha_fin_estimada && ` · fin ${fechaCorta(p.fecha_fin_estimada, hoy)}`}
                        </span>
                      </span>
                      {n !== null && n <= 7 && (
                        <span
                          className={cn(
                            "shrink-0 rounded-full border px-2 text-xs leading-5 font-semibold",
                            n < 0 ? "border-negativo text-negativo" : "border-aviso text-aviso"
                          )}
                        >
                          {n < 0 ? "Entrega vencida" : n === 0 ? "Entrega hoy" : n === 1 ? "Entrega mañana" : `Entrega en ${n} días`}
                        </span>
                      )}
                    </span>
                    {activo && delProyecto.length > 0 && (
                      <>
                        <BarraAvance hechas={hechas} total={delProyecto.length} />
                        <span className="zq-num text-xs text-muted-foreground">
                          {codigoSprint(activo.numero)}: {hechas} de {delProyecto.length} tarjetas hechas (
                          {Math.round((hechas / delProyecto.length) * 100)}%)
                        </span>
                      </>
                    )}
                  </Link>
                )
              })
            )}
          </section>

          <section aria-labelledby="empresa" className="rounded-xl border px-6 py-5">
            <h2 id="empresa" className="zq-rotulo mb-3">
              La empresa
            </h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {porEstado.map((e) => (
                <li key={e.estado} className="flex items-center justify-between">
                  <BadgeEstadoProyecto estado={e.estado} />
                  <span className="zq-num font-semibold">{e.n}</span>
                </li>
              ))}
            </ul>
            <Link href="/finanzas" className="mt-3 inline-block text-sm font-semibold">
              Ver finanzas →
            </Link>
          </section>

          <section aria-labelledby="usoapi" className="rounded-xl border px-6 py-5">
            <h2 id="usoapi" className="zq-rotulo mb-3">
              API de Claude
            </h2>
            <p className="m-0 flex items-baseline justify-between gap-2">
              <span>Este mes</span>
              <span className="zq-num text-xl font-semibold">US$ {formatearNumero(usoApi.mes, 2)}</span>
            </p>
            <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-sm text-muted-foreground">
              {usoApi.porFuncion.length > 1 &&
                usoApi.porFuncion.map((f) => (
                  <li key={f.funcion} className="flex justify-between gap-2">
                    <span>{NOMBRE_FUNCION[f.funcion] ?? f.funcion}</span>
                    <span className="zq-num">US$ {formatearNumero(f.usd, 2)}</span>
                  </li>
                ))}
              <li className="flex justify-between gap-2">
                <span>Proyección a fin de mes</span>
                <span className="zq-num">US$ {formatearNumero(usoApi.proyeccion, 2)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>Mes pasado</span>
                <span className="zq-num">US$ {formatearNumero(usoApi.mesAnterior, 2)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>Llamadas este mes</span>
                <span className="zq-num">{formatearNumero(usoApi.llamadas)}</span>
              </li>
            </ul>
            <Link href="/web/chats" className="mt-3 inline-block text-sm font-semibold">
              Ver chats →
            </Link>
          </section>
        </div>
      </div>
    </>
  )
}

function AccionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={href} />}>
      {children}
    </Button>
  )
}

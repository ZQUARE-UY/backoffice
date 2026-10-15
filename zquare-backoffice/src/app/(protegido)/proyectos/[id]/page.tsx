import Link from "next/link"
import { notFound } from "next/navigation"

import { eliminarProyecto } from "@/app/(protegido)/clientes/actions"
import { NuevoPresupuesto } from "@/app/(protegido)/clientes/[id]/nuevo-presupuesto"
import { BotonEliminar } from "@/components/boton-eliminar"
import { Encabezado } from "@/components/zq/encabezado"
import { Pestanas } from "@/components/zq/pestanas"
import { EtiquetaArchivo } from "@/components/zq/tipo-archivo"
import { driveConfigurado, listarArchivosDeCarpeta } from "@/lib/drive"
import {
  briefProyectoCompleto,
  codigoIdea,
  codigoSprint,
  codigoTarea,
  ESTADOS_PRESUPUESTO,
  ESTADOS_TAREA,
  formatearMonto,
  formatearUsd,
  nombrePresupuesto,
  proyectoComenzado,
  TIPOS_PROYECTO,
  type Cliente,
  type EstadoPresupuesto,
  type EstadoTarea,
  type PrioridadTarea,
  type Proyecto,
  type Socio,
} from "@/lib/dominio"
import { diasHasta, fechaCorta, iniciales, vencimiento } from "@/lib/formato"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

import { ComenzarProyecto } from "../comenzar-proyecto"
import { BarraAvance, faltaPara, TONO_TEXTO } from "../ui"
import { COLOR_COLUMNA } from "../../tareas/tarjeta"
import { BriefProyecto } from "./brief-proyecto"
import { EditarProyecto } from "./editar-proyecto"

type TareaProyecto = {
  id: string
  numero: number
  titulo: string
  estado: EstadoTarea
  prioridad: PrioridadTarea
  fecha_limite: string | null
  asignado_a: string | null
  etiquetas: string[]
  sprint_id: string | null
}

type Pestana = "resumen" | "tareas" | "documentos" | "decisiones" | "plata"
const PESTANAS: Pestana[] = ["resumen", "tareas", "documentos", "decisiones", "plata"]

// Las abiertas, de la más avanzada a la que falta empezar.
const ORDEN_ABIERTAS: EstadoTarea[] = ["en_revision", "en_curso", "por_hacer", "backlog"]

// Los puntos de una decisión salen de su `detalle`: si viene numerado (o en
// viñetas), un punto por línea; si no, un punto por párrafo.
function puntosDe(detalle: string | null): string[] {
  if (!detalle) return []
  const lineas = detalle.split("\n").map((l) => l.trim()).filter(Boolean)
  const marcadas = lineas.filter((l) => /^(\d+[.)]|[-•*])\s+/.test(l))
  if (marcadas.length >= 2) return marcadas.map((l) => l.replace(/^(\d+[.)]|[-•*])\s+/, ""))
  return detalle.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
}

export default async function ProyectoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab } = await searchParams
  const pestana: Pestana = PESTANAS.includes(tab as Pestana) ? (tab as Pestana) : "resumen"
  const supabase = await createClient()

  const { data: proyecto } = await supabase
    .from("proyectos")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<Proyecto>()

  if (!proyecto) notFound()

  const [
    { data: cliente },
    { data: tareasData },
    { data: ideaOrigen },
    { data: sociosData },
    { data: sprintData },
    { data: decisionesData },
    { data: presupuestosData },
    { data: movimientosData },
    { data: documentosData },
    archivosDrive,
  ] = await Promise.all([
    // cliente_id null = proyecto interno (ej. graduado del banco de ideas).
    proyecto.cliente_id
      ? supabase.from("clientes").select("*").eq("id", proyecto.cliente_id).maybeSingle<Cliente>()
      : Promise.resolve({ data: null }),
    supabase
      .from("tareas")
      .select("id, numero, titulo, estado, prioridad, fecha_limite, asignado_a, etiquetas, sprint_id")
      .eq("proyecto_id", id)
      .is("deleted_at", null)
      .order("orden"),
    // La vuelta de la trazabilidad de la graduación: la idea guarda a qué
    // proyecto graduó.
    supabase
      .from("ideas")
      .select("id, numero, titulo")
      .eq("proyecto_id", id)
      .is("deleted_at", null)
      .maybeSingle<{ id: string; numero: number; titulo: string }>(),
    supabase.from("socios").select("id, nombre, email").is("deleted_at", null).order("nombre"),
    supabase.from("sprints").select("id, numero").eq("estado", "activo").is("deleted_at", null).maybeSingle(),
    supabase
      .from("decisiones")
      .select("id, titulo, detalle, fecha, participantes")
      .eq("proyecto_id", id)
      .is("deleted_at", null)
      .order("fecha", { ascending: false }),
    supabase
      .from("presupuestos")
      .select("id, numero, titulo, version, estado, total, moneda, fecha_envio")
      .eq("proyecto_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("movimientos")
      .select("tipo, monto_usd")
      .eq("proyecto_id", id)
      .eq("estado", "confirmado")
      .is("deleted_at", null),
    // Documentos anotados a mano (links que no están en la carpeta de Drive).
    supabase
      .from("documentos")
      .select("id, titulo, drive_url, fecha, drive_file_id")
      .eq("proyecto_id", id)
      .is("deleted_at", null),
    // La carpeta del proyecto en Drive. Si Drive falla, la ficha igual carga.
    proyecto.drive_folder_id && driveConfigurado()
      ? listarArchivosDeCarpeta(proyecto.drive_folder_id).catch(() => null)
      : Promise.resolve(null),
  ])

  const tareas = (tareasData ?? []) as TareaProyecto[]
  const socios = (sociosData ?? []) as Socio[]
  const nombreSocio = new Map(socios.map((s) => [s.id, s.nombre.split(" ")[0]]))
  const sprint = sprintData as { id: string; numero: number } | null
  const decisiones = (decisionesData ?? []) as {
    id: string
    titulo: string
    detalle: string | null
    fecha: string
    participantes: string[]
  }[]
  const presupuestos = (presupuestosData ?? []) as {
    id: string
    numero: number
    titulo: string | null
    version: number
    estado: EstadoPresupuesto
    total: number
    moneda: string
    fecha_envio: string | null
  }[]
  const movimientos = (movimientosData ?? []) as { tipo: string; monto_usd: number }[]

  // Documentos: los de Drive, más los anotados que no son archivos de esa
  // carpeta. Del más nuevo al más viejo.
  const enDrive = new Set((archivosDrive ?? []).map((a) => a.id))
  const documentos = [
    ...(archivosDrive ?? []).map((a) => ({
      id: a.id,
      nombre: a.nombre,
      url: a.url,
      carpeta: a.carpeta || proyecto.nombre,
      fecha: a.modificado ?? "",
    })),
    ...((documentosData ?? []) as { id: string; titulo: string; drive_url: string; fecha: string; drive_file_id: string | null }[])
      .filter((d) => !d.drive_file_id || !enDrive.has(d.drive_file_id))
      .map((d) => ({ id: d.id, nombre: d.titulo, url: d.drive_url, carpeta: "Anotado", fecha: d.fecha })),
  ].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))

  const abiertas = tareas
    .filter((t) => t.estado !== "hecho")
    .sort((a, b) => ORDEN_ABIERTAS.indexOf(a.estado) - ORDEN_ABIERTAS.indexOf(b.estado))
  const hechas = tareas.length - abiertas.length
  const enSprint = sprint ? tareas.filter((t) => t.sprint_id === sprint.id) : []
  const hechasSprint = enSprint.filter((t) => t.estado === "hecho").length

  const responsable = proyecto.responsable_id ? (nombreSocio.get(proyecto.responsable_id) ?? null) : null
  // El equipo: quienes tienen tareas en el proyecto, además del responsable.
  const equipo = Array.from(
    new Set(
      tareas
        .map((t) => t.asignado_a)
        .filter((a): a is string => Boolean(a) && a !== proyecto.responsable_id)
        .map((a) => nombreSocio.get(a))
        .filter((n): n is string => Boolean(n))
    )
  )

  const abierto = proyecto.estado !== "entregado" && proyecto.estado !== "cancelado"
  const diasFin = proyecto.fecha_fin_estimada ? diasHasta(proyecto.fecha_fin_estimada) : null
  // Badge de urgencia del encabezado: entrega en 7 días o menos.
  const urgencia =
    abierto && diasFin !== null && diasFin <= 7
      ? diasFin < 0
        ? { texto: "Entrega vencida", vencida: true }
        : {
            texto: diasFin === 0 ? "Entrega hoy" : diasFin === 1 ? "Entrega mañana" : `Entrega en ${diasFin} días`,
            vencida: false,
          }
      : null

  const href = (clave: Pestana) => (clave === "resumen" ? `/proyectos/${id}` : `/proyectos/${id}?tab=${clave}`)
  const rotulo = [cliente?.nombre ?? "Interno", proyecto.tipo ? TIPOS_PROYECTO[proyecto.tipo].label : null]
    .filter(Boolean)
    .join(" · ")

  const cobrado = movimientos.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + Number(m.monto_usd), 0)
  const gastado = movimientos.filter((m) => m.tipo === "gasto").reduce((s, m) => s + Number(m.monto_usd), 0)

  return (
    <>
      <Encabezado
        titulo={proyecto.nombre}
        rotulo={rotulo}
        volverA={{ href: "/proyectos", label: "Volver a Proyectos" }}
        acciones={
          <>
            {urgencia && (
              <span
                className={cn(
                  "rounded-full px-2.5 text-xs leading-[22px] font-semibold",
                  urgencia.vencida ? "border border-negativo text-negativo" : "bg-lima text-carbon"
                )}
              >
                {urgencia.texto}
              </span>
            )}
            {!proyectoComenzado(proyecto) && proyecto.estado !== "cancelado" && (
              <ComenzarProyecto
                id={proyecto.id}
                nombre={proyecto.nombre}
                briefListo={briefProyectoCompleto(proyecto)}
              />
            )}
            <EditarProyecto proyecto={proyecto} socios={socios} />
            <BotonEliminar
              soloIcono
              accion={eliminarProyecto.bind(null, proyecto.id, proyecto.cliente_id)}
              titulo={`¿Eliminar "${proyecto.nombre}"?`}
              descripcion="Se ocultará el proyecto. Podés recuperarlo desde la base si hace falta."
            />
          </>
        }
      />

      <Pestanas
        label="Secciones del proyecto"
        activa={pestana}
        pestanas={[
          { clave: "resumen", texto: "Resumen", href: href("resumen") },
          { clave: "tareas", texto: `Tareas · ${abiertas.length}`, href: href("tareas") },
          {
            clave: "documentos",
            texto: archivosDrive === null && proyecto.drive_folder_id ? "Documentos" : `Documentos · ${documentos.length}`,
            href: href("documentos"),
          },
          { clave: "decisiones", texto: `Decisiones · ${decisiones.length}`, href: href("decisiones") },
          { clave: "plata", texto: "Plata", href: href("plata") },
        ]}
      />

      {pestana === "resumen" && (
        <section className="flex flex-col gap-3.5" aria-label="Resumen">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            {/* Sprint (o tareas, si el proyecto no está en el sprint activo). */}
            <div className="rounded-xl border bg-card px-[18px] py-4">
              {sprint && enSprint.length > 0 ? (
                <>
                  <p className="m-0 text-xs text-muted-foreground">{codigoSprint(sprint.numero)}</p>
                  <p className="zq-num m-0 mt-1.5 mb-2 font-display text-[30px] leading-9">
                    {Math.round((hechasSprint / enSprint.length) * 100)}%
                  </p>
                  <BarraAvance hechas={hechasSprint} total={enSprint.length} className="mb-1.5" />
                  <p className="m-0 text-xs text-muted-foreground">
                    {hechasSprint} de {enSprint.length} hechas
                  </p>
                </>
              ) : (
                <>
                  <p className="m-0 text-xs text-muted-foreground">Tareas</p>
                  <p className="zq-num m-0 mt-1.5 mb-1 font-display text-[30px] leading-9">{abiertas.length}</p>
                  <p className="m-0 text-xs text-muted-foreground">
                    {tareas.length === 0
                      ? "Sin tareas todavía"
                      : `abiertas · ${hechas} hechas${sprint ? ` · fuera del ${codigoSprint(sprint.numero)}` : ""}`}
                  </p>
                </>
              )}
            </div>
            <div className="rounded-xl border bg-card px-[18px] py-4">
              <p className="m-0 text-xs text-muted-foreground">Responsable</p>
              <p className="m-0 mt-2.5 mb-1 flex items-center gap-2.5 text-base font-semibold">
                {responsable ? (
                  <>
                    <span className="zq-avatar">{iniciales(responsable)}</span>
                    {responsable}
                  </>
                ) : (
                  <span className="font-normal text-muted-foreground">Sin responsable</span>
                )}
              </p>
              {equipo.length > 0 && (
                <p className="m-0 text-xs text-muted-foreground">
                  Con {equipo.length === 1 ? equipo[0] : `${equipo.slice(0, -1).join(", ")} y ${equipo.at(-1)}`}
                </p>
              )}
            </div>
            <div
              className={cn(
                "rounded-xl border bg-card px-[18px] py-4",
                abierto && diasFin !== null && diasFin <= 7 && (diasFin < 0 ? "border-negativo" : "border-aviso")
              )}
            >
              <p className="m-0 text-xs text-muted-foreground">Fin estimado</p>
              {proyecto.fecha_fin_estimada ? (
                <>
                  <p className="zq-num m-0 mt-1.5 mb-0.5 font-display text-[30px] leading-9">
                    {fechaCorta(proyecto.fecha_fin_estimada)}
                  </p>
                  {abierto && (() => {
                    const f = faltaPara(proyecto.fecha_fin_estimada)
                    return (
                      <p className={cn("m-0 text-xs", f.tono ? `font-semibold ${TONO_TEXTO[f.tono]}` : "text-muted-foreground")}>
                        {f.texto}
                      </p>
                    )
                  })()}
                </>
              ) : (
                <p className="m-0 mt-1.5 font-display text-[30px] leading-9 text-muted-foreground">—</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card px-[18px] py-4">
            <p className="m-0 text-xs text-muted-foreground">Objetivo</p>
            {proyecto.objetivo || proyecto.descripcion ? (
              <p className="m-0 mt-1.5 text-base leading-6">{proyecto.objetivo ?? proyecto.descripcion}</p>
            ) : (
              <p className="m-0 mt-1.5 text-muted-foreground">
                Sin objetivo todavía. Se completa al comenzar el proyecto con Claude o desde el brief.
              </p>
            )}
            <p className="m-0 mt-3 text-xs text-muted-foreground">
              {proyecto.kickoff_completado_at
                ? `Comenzado el ${fechaCorta(proyecto.kickoff_completado_at)}${proyecto.kickoff_por ? ` por ${proyecto.kickoff_por}` : ""}`
                : "Sin comenzar"}
              {ideaOrigen && (
                <>
                  {" · Graduado de "}
                  <Link href={`/ideas/${ideaOrigen.id}`} className="hover:underline">
                    {codigoIdea(ideaOrigen.numero)} · {ideaOrigen.titulo}
                  </Link>
                </>
              )}
            </p>
          </div>

          <details className="group rounded-xl border bg-card px-[18px] py-3">
            <summary className="cursor-pointer font-semibold select-none">Leer el brief completo</summary>
            <div className="pt-3">
              <BriefProyecto proyecto={proyecto} />
            </div>
          </details>
        </section>
      )}

      {pestana === "tareas" && (
        <section className="flex flex-col gap-3.5" aria-label="Tareas">
          <div className="flex items-center gap-4 rounded-xl border bg-card px-[18px] py-4">
            <BarraAvance hechas={hechas} total={tareas.length} className="h-2.5 flex-1" />
            <span className="zq-num whitespace-nowrap">
              <strong>{hechas}</strong>{" "}
              <span className="text-muted-foreground">
                {hechas === 1 ? "hecha" : "hechas"} · {abiertas.length} {abiertas.length === 1 ? "abierta" : "abiertas"}
              </span>
            </span>
          </div>
          {abiertas.length === 0 && (
            <p className="m-0 rounded-xl border border-dashed border-input p-6 text-center text-muted-foreground">
              {tareas.length === 0 ? "El proyecto todavía no tiene tareas." : "No quedan tareas abiertas."}
            </p>
          )}
          {abiertas.map((t) => {
            const quien = t.asignado_a ? nombreSocio.get(t.asignado_a) : null
            const nota = t.etiquetas.includes("bloqueada-por-cliente")
              ? "Bloqueada por el cliente"
              : t.fecha_limite
                ? vencimiento(t.fecha_limite)
                : t.prioridad === "urgente" || t.prioridad === "alta"
                  ? `Prioridad ${t.prioridad}`
                  : null
            return (
              <Link
                key={t.id}
                href={`/tareas?tarea=${codigoTarea(t.numero)}`}
                className="flex items-center gap-3.5 rounded-xl border bg-card px-[18px] py-3.5 text-foreground no-underline hover:border-input"
              >
                <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", COLOR_COLUMNA[t.estado])} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-semibold">{t.titulo}</span>
                  <span className="text-xs text-muted-foreground">
                    {codigoTarea(t.numero)} · {ESTADOS_TAREA[t.estado].label}
                    {nota && ` · ${nota}`}
                  </span>
                </span>
                {quien ? (
                  <span className="zq-avatar" title={quien}>
                    {iniciales(quien)}
                  </span>
                ) : (
                  <span title="Sin responsable" className="size-7 shrink-0 rounded-full border border-dashed border-input" />
                )}
              </Link>
            )
          })}
          <Link
            href={proyecto.cliente_id ? `/tareas?cliente=${proyecto.cliente_id}&proyecto=${id}` : `/tareas?proyecto=${id}`}
            className="self-start font-semibold"
          >
            Ver el tablero →
          </Link>
        </section>
      )}

      {pestana === "documentos" && (
        <section aria-label="Documentos" className="rounded-xl border bg-card px-[18px] py-1.5">
          {documentos.length === 0 ? (
            <p className="m-0 py-6 text-center text-muted-foreground">
              {!proyecto.drive_folder_id
                ? "El proyecto no tiene carpeta en Drive todavía."
                : archivosDrive === null
                  ? "No se pudo leer la carpeta de Drive. Probá de nuevo en un rato."
                  : "La carpeta del proyecto está vacía."}
            </p>
          ) : (
            <ul className="m-0 list-none p-0">
              {documentos.map((d) => (
                <li key={d.id} className="flex items-center gap-3 border-t py-3 first:border-t-0">
                  <EtiquetaArchivo nombre={d.nombre} />
                  <a href={d.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                    {d.nombre}
                  </a>
                  <span className="hidden w-36 shrink-0 truncate text-xs text-muted-foreground sm:block">{d.carpeta}</span>
                  <span className="zq-num w-14 shrink-0 text-right text-xs text-muted-foreground">
                    {d.fecha ? fechaCorta(d.fecha) : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {pestana === "decisiones" && (
        <section aria-label="Decisiones" className="flex flex-col gap-3.5">
          {decisiones.length === 0 && (
            <p className="m-0 rounded-xl border border-dashed border-input p-6 text-center text-muted-foreground">
              Todavía no hay decisiones registradas para este proyecto.
            </p>
          )}
          {decisiones.map((d) => {
            const puntos = puntosDe(d.detalle)
            return (
              <article key={d.id} className="flex flex-col gap-3.5 rounded-xl border bg-card px-6 py-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="rounded-full bg-muted px-2.5 text-xs leading-[22px] font-semibold">{fechaCorta(d.fecha)}</span>
                  {d.participantes.length > 0 && (
                    <span className="flex pl-1.5" aria-label={`Presentes: ${d.participantes.join(", ")}`}>
                      {d.participantes.map((p) => (
                        <span key={p} title={p} className="zq-avatar -ml-1.5 ring-2 ring-card">
                          {iniciales(p)}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                <h2 className="m-0 text-lg leading-[26px] font-semibold">{d.titulo}</h2>
                {puntos.length > 0 && (
                  <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2.5 p-0">
                    {puntos.map((p, i) => (
                      <li key={i} className="rounded-[10px] bg-muted px-3.5 py-3">
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            )
          })}
        </section>
      )}

      {pestana === "plata" && (
        <section aria-label="Plata" className="flex flex-col gap-3">
          {proyecto.monto_acordado == null && presupuestos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-input px-6 py-8 text-center">
              <p className="m-0 font-display text-[30px] leading-9 text-muted-foreground">USD —</p>
              <p className="m-0 font-semibold">Todavía no hay monto acordado ni presupuesto</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <EditarProyecto proyecto={proyecto} socios={socios} etiqueta="Cargar monto" variante="default" />
                {proyecto.cliente_id && (
                  <NuevoPresupuesto clienteId={proyecto.cliente_id} proyectos={[{ id: proyecto.id, nombre: proyecto.nombre }]} />
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
              <div className="rounded-xl border bg-card px-[18px] py-4">
                <p className="m-0 text-xs text-muted-foreground">Acordado</p>
                <p className="zq-num m-0 mt-1.5 font-display text-[30px] leading-9">
                  {proyecto.monto_acordado != null ? formatearMonto(proyecto.monto_acordado, proyecto.moneda) : "—"}
                </p>
                {proyecto.monto_acordado == null && (
                  <div className="mt-2">
                    <EditarProyecto proyecto={proyecto} socios={socios} etiqueta="Cargar monto" />
                  </div>
                )}
              </div>
              <div className="rounded-xl border bg-card px-[18px] py-4">
                <p className="m-0 text-xs text-muted-foreground">Cobrado</p>
                <p className="zq-num m-0 mt-1.5 font-display text-[30px] leading-9">{formatearUsd(cobrado)}</p>
                {gastado > 0 && (
                  <p className="zq-num m-0 text-xs text-muted-foreground">Gastos {formatearUsd(gastado)}</p>
                )}
              </div>
            </div>
          )}
          {presupuestos.length > 0 && (
            <ul className="m-0 list-none rounded-xl border bg-card px-[18px] py-1.5">
              {presupuestos.map((p) => (
                <li key={p.id} className="flex items-center gap-3 border-t py-3 first:border-t-0">
                  <Link href={`/presupuestos/${p.id}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">
                    {nombrePresupuesto(p)}
                  </Link>
                  <span className="text-xs text-muted-foreground">{ESTADOS_PRESUPUESTO[p.estado].label}</span>
                  <span className="zq-num w-28 text-right">{formatearMonto(Number(p.total), p.moneda)}</span>
                </li>
              ))}
            </ul>
          )}
          {cobrado === 0 && gastado === 0 && (proyecto.monto_acordado != null || presupuestos.length > 0) && (
            <p className="m-0 text-xs text-muted-foreground">Todavía no hay movimientos asociados a este proyecto.</p>
          )}
        </section>
      )}
    </>
  )
}

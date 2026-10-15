import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Encabezado } from "@/components/zq/encabezado"
import { driveConfigurado, listarArchivosDeCarpeta } from "@/lib/drive"
import {
  ESTADOS_CLIENTE,
  formatearUsd,
  type Cliente,
  type EstadoCliente,
  type EstadoProyecto,
} from "@/lib/dominio"
import { fechaCorta, iniciales } from "@/lib/formato"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

import { BadgeEstadoProyecto } from "../proyectos/ui"
import { EditarCliente } from "./[id]/editar-cliente"
import { NuevoCliente } from "./nuevo-cliente"

export const metadata = { title: "Clientes" }

const PESO: Record<EstadoCliente, number> = { activo: 0, potencial: 1, inactivo: 2 }

const ESTILO_ESTADO: Record<EstadoCliente, string> = {
  activo: "bg-lima text-carbon",
  potencial: "bg-muted text-foreground",
  inactivo: "bg-foreground text-background",
}

type ProyectoCliente = { id: string; nombre: string; estado: EstadoProyecto; cliente_id: string; created_at: string }

// Clientes: la lista a la izquierda y la ficha del elegido a la derecha
// (`?cliente=<id>`). La ficha completa, con Drive, presupuestos y
// documentos, sigue en /clientes/[id].
export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>
}) {
  const { cliente: elegidoParam } = await searchParams
  const supabase = await createClient()

  const [{ data: clientesData }, { data: proyectosData }] = await Promise.all([
    supabase.from("clientes").select("*").is("deleted_at", null),
    supabase
      .from("proyectos")
      .select("id, nombre, estado, cliente_id, created_at")
      .not("cliente_id", "is", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ])

  const clientes = ((clientesData ?? []) as Cliente[]).sort(
    (a, b) => PESO[a.estado] - PESO[b.estado] || a.nombre.localeCompare(b.nombre, "es")
  )
  const proyectos = (proyectosData ?? []) as ProyectoCliente[]
  const proyectosDe = (id: string) => proyectos.filter((p) => p.cliente_id === id)

  const elegido = clientes.find((c) => c.id === elegidoParam) ?? (elegidoParam ? null : clientes[0]) ?? null

  return (
    <>
      <Encabezado titulo="Clientes" acciones={<NuevoCliente escucharCrear />} />

      {clientes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-input p-8 text-center text-muted-foreground">
          <p className="m-0 font-semibold text-foreground">Sin clientes</p>
          <p className="m-0 mt-1">Creá el primero para empezar a cargar proyectos y documentos.</p>
        </div>
      ) : (
        <div className="flex min-h-[640px] flex-wrap items-stretch overflow-hidden rounded-xl border bg-card">
          <nav
            aria-label="Clientes"
            className={cn(
              "flex min-w-[260px] flex-[0_1_320px] flex-col gap-0.5 border-r p-3 max-escritorio:flex-auto max-escritorio:border-r-0",
              elegidoParam && "max-escritorio:hidden"
            )}
          >
            {clientes.map((c) => {
              const n = proyectosDe(c.id).length
              const on = c.id === elegido?.id
              return (
                <Link
                  key={c.id}
                  href={`/clientes?cliente=${c.id}`}
                  scroll={false}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex min-h-[52px] items-center gap-3 rounded-lg px-2.5 py-2 text-foreground no-underline hover:bg-muted",
                    on && "bg-muted",
                    c.estado === "inactivo" && "opacity-70"
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold",
                      c.estado === "activo" ? "bg-lima text-carbon" : "bg-muted text-foreground"
                    )}
                  >
                    {iniciales(c.nombre)}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{c.nombre}</span>
                    <span className="text-xs text-muted-foreground">
                      {ESTADOS_CLIENTE[c.estado].label} · {n ? `${n} ${n === 1 ? "proyecto" : "proyectos"}` : "sin proyectos"}
                    </span>
                  </span>
                </Link>
              )
            })}
          </nav>

          {elegido ? (
            <FichaCliente
              cliente={elegido}
              proyectos={proyectosDe(elegido.id)}
              soloEnEscritorio={!elegidoParam}
            />
          ) : (
            <section className="flex flex-[1_1_480px] items-center justify-center p-8 text-muted-foreground">
              Ese cliente no existe o fue eliminado.
            </section>
          )}
        </div>
      )}
    </>
  )
}

async function FichaCliente({
  cliente,
  proyectos,
  soloEnEscritorio,
}: {
  cliente: Cliente
  proyectos: ProyectoCliente[]
  // En celular, sin un cliente elegido en la URL se ve solo la lista.
  soloEnEscritorio: boolean
}) {
  const supabase = await createClient()
  const idsProyectos = proyectos.map((p) => p.id)

  const [{ data: decisionesData }, { data: movimientosData }, { data: reunionesData }, archivos] = await Promise.all([
    supabase
      .from("decisiones")
      .select("titulo, fecha")
      .eq("cliente_id", cliente.id)
      .is("deleted_at", null)
      .order("fecha", { ascending: false }),
    supabase
      .from("movimientos")
      .select("tipo, monto_usd, fecha, descripcion, cliente_id, proyecto_id")
      .is("deleted_at", null)
      .or(
        idsProyectos.length
          ? `cliente_id.eq.${cliente.id},proyecto_id.in.(${idsProyectos.join(",")})`
          : `cliente_id.eq.${cliente.id}`
      )
      .order("fecha", { ascending: false }),
    supabase
      .from("solicitudes_reunion")
      .select("titulo, inicio")
      .eq("cliente_id", cliente.id)
      .eq("estado", "agendada")
      .lte("inicio", new Date().toISOString())
      .is("deleted_at", null)
      .order("inicio", { ascending: false })
      .limit(1),
    // Los documentos son los de su carpeta en Drive. Si Drive falla, la
    // ficha igual carga (sin ese número).
    cliente.drive_folder_id && driveConfigurado()
      ? listarArchivosDeCarpeta(cliente.drive_folder_id).catch(() => null)
      : Promise.resolve(null),
  ])

  const decisiones = (decisionesData ?? []) as { titulo: string; fecha: string }[]
  const movimientos = (movimientosData ?? []) as { tipo: string; monto_usd: number; fecha: string; descripcion: string | null }[]
  const cobrado = movimientos.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + Number(m.monto_usd), 0)

  // Última actividad: lo más reciente entre decisiones, movimientos,
  // reuniones, proyectos y archivos de Drive.
  const candidatos: { fecha: string; texto: string }[] = [
    ...decisiones.slice(0, 1).map((d) => ({ fecha: d.fecha, texto: `Decisión: ${d.titulo}` })),
    ...movimientos.slice(0, 1).map((m) => ({
      fecha: m.fecha,
      texto: `${m.tipo === "ingreso" ? "Cobro" : "Gasto"}${m.descripcion ? ` «${m.descripcion}»` : ""}, ${formatearUsd(Number(m.monto_usd))}`,
    })),
    ...((reunionesData ?? []) as { titulo: string; inicio: string }[]).map((r) => ({
      fecha: r.inicio.slice(0, 10),
      texto: `Reunión: ${r.titulo}`,
    })),
    ...proyectos.slice(0, 1).map((p) => ({ fecha: p.created_at.slice(0, 10), texto: `Proyecto nuevo: ${p.nombre}` })),
    ...(archivos ?? [])
      .filter((a) => a.modificado)
      .sort((a, b) => (b.modificado ?? "").localeCompare(a.modificado ?? ""))
      .slice(0, 1)
      .map((a) => ({ fecha: (a.modificado ?? "").slice(0, 10), texto: `Documento en Drive: «${a.nombre}»` })),
  ]
  const ultima = candidatos.sort((a, b) => b.fecha.localeCompare(a.fecha))[0] ?? null
  const contacto = [cliente.email, cliente.telefono].filter(Boolean).join(" · ")

  const cifras = [
    { rotulo: "Proyectos", valor: String(proyectos.length) },
    { rotulo: "Cobrado", valor: cobrado > 0 ? formatearUsd(cobrado) : "—" },
    { rotulo: "Documentos", valor: archivos ? String(archivos.length) : "—" },
    { rotulo: "Decisiones", valor: String(decisiones.length) },
  ]

  return (
    <section
      aria-label={`Ficha de ${cliente.nombre}`}
      className={cn("flex min-w-0 flex-[1_1_480px] flex-col gap-6 px-8 py-7 max-escritorio:px-4", soloEnEscritorio && "max-escritorio:hidden")}
    >
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        render={<Link href="/clientes" />}
        className="-ml-2 self-start escritorio:hidden"
      >
        <ArrowLeftIcon data-icon="inline-start" />
        Todos los clientes
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span
            className={cn(
              "inline-flex size-14 shrink-0 items-center justify-center rounded-[14px] text-lg font-bold",
              cliente.estado === "activo" ? "bg-lima text-carbon" : "bg-muted text-foreground"
            )}
          >
            {iniciales(cliente.nombre)}
          </span>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="m-0 font-display text-[30px] leading-9 font-normal">{cliente.nombre}</h2>
              <span className={cn("rounded-full px-2.5 text-xs leading-[22px] font-semibold", ESTILO_ESTADO[cliente.estado])}>
                {ESTADOS_CLIENTE[cliente.estado].label}
              </span>
            </div>
            <span className={cn("text-muted-foreground", !contacto && "italic")}>{contacto || "Sin contacto cargado"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <EditarCliente cliente={cliente} />
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/clientes/${cliente.id}`} />}>
            Ficha completa →
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {cifras.map((c) => (
          <div key={c.rotulo} className="rounded-xl border px-4 pt-4 pb-[18px]">
            <p className="m-0 mb-1.5 text-[13px] text-muted-foreground">{c.rotulo}</p>
            <p className="zq-num m-0 text-2xl leading-[30px] font-semibold tracking-[-0.01em]">{c.valor}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="zq-rotulo text-[13px]">Proyectos</h3>
        {proyectos.length === 0 ? (
          <p className="m-0 rounded-[10px] border border-dashed border-input px-4 py-3.5 text-muted-foreground">
            Todavía no hay proyectos con este cliente.
          </p>
        ) : (
          <ul className="m-0 list-none rounded-[10px] border p-0">
            {proyectos.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 border-t px-4 py-3 first:border-t-0">
                <Link href={`/proyectos/${p.id}`} className="font-semibold text-foreground">
                  {p.nombre}
                </Link>
                <BadgeEstadoProyecto estado={p.estado} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="zq-rotulo text-[13px]">Última actividad</h3>
        <p className="m-0">{ultima ? `${fechaCorta(ultima.fecha)} · ${ultima.texto}` : "Sin actividad registrada."}</p>
      </div>
    </section>
  )
}

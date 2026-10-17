"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { ChevronDownIcon, ChevronRightIcon, GripVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
  contenidoPublico,
  TIPOS,
  type Bloque,
  type ClaveSeccion,
  type Idioma,
  type Secciones,
  type SocioWeb,
  type TipoBloque,
} from "@/lib/contenido-web"
import { cn } from "@/lib/utils"

import { publicarContenido, type BorradorBloque } from "./actions"
import { FotoSocio } from "./foto-socio"
import { VistaPrevia, type Dispositivo } from "./vista-previa"

type Seccion = TipoBloque | "equipo"
type Borrador = { bloques: BorradorBloque[]; socios: SocioWeb[]; secciones: Secciones }

// Secciones en el orden de la página. `ancla` es el id de su <section> en la
// web (para que la vista previa vaya ahí) y la clave con la que se prende y
// apaga.
const SECCIONES: { valor: Seccion; label: string; ancla: ClaveSeccion }[] = [
  { valor: "servicio", label: "Servicios", ancla: "servicios" },
  { valor: "paso", label: "Método", ancla: "metodo" },
  { valor: "equipo", label: "Equipo", ancla: "equipo" },
  { valor: "testimonio", label: "Testimonios", ancla: "testimonios" },
]

// Lo que cuenta como cambio de un bloque o un socio (sin el orden, que se
// compara aparte, ni la foto, que se publica sola).
const firmaBloque = (b: BorradorBloque) => JSON.stringify([b.publicado, b.es, b.en, b.nombre, b.empresa])
const firmaSocio = (s: SocioWeb) => JSON.stringify([s.web_visible, s.web_cargo_es, s.web_cargo_en])

// Web → Contenido: un panel a la izquierda con las secciones en acordeón (el
// elemento elegido se despliega con sus campos ahí mismo) y zquare.uy a la
// derecha con el borrador aplicado. Nada se guarda hasta "Publicar", salvo
// las fotos, que se suben en el momento.
export function EditorWeb({
  bloques,
  socios,
  secciones,
  webUrl,
}: {
  bloques: Bloque[]
  socios: SocioWeb[]
  secciones: Secciones
  webUrl: string
}) {
  const [base, setBase] = useState<Borrador>(() => ({ bloques, socios, secciones }))
  const [borrador, setBorrador] = useState<Borrador>(base)
  const [abierta, setAbierta] = useState<Seccion | null>("servicio")
  const [elegido, setElegido] = useState<string | null>(() => bloques.find((b) => b.tipo === "servicio")?.id ?? null)
  const [idioma, setIdioma] = useState<Idioma>("es")
  const [dispositivo, setDispositivo] = useState<Dispositivo>("escritorio")
  const [arrastrado, setArrastrado] = useState<string | null>(null)
  const [publicando, iniciarPublicacion] = useTransition()

  // ── Qué cambió respecto de lo publicado ──
  const editados = useMemo(() => {
    const ids = new Set<string>()
    const enBase = new Map(base.bloques.map((b) => [b.id, b]))
    const indice = (lista: BorradorBloque[], b: BorradorBloque) =>
      lista.filter((x) => x.tipo === b.tipo && !x.eliminado).findIndex((x) => x.id === b.id)
    for (const b of borrador.bloques) {
      const antes = enBase.get(b.id)
      if (b.eliminado ? !b.nuevo : b.nuevo || !antes || firmaBloque(b) !== firmaBloque(antes) || indice(borrador.bloques, b) !== indice(base.bloques, antes)) {
        ids.add(b.id)
      }
    }
    borrador.socios.forEach((s, i) => {
      const j = base.socios.findIndex((x) => x.id === s.id)
      if (j !== i || firmaSocio(s) !== firmaSocio(base.socios[j])) ids.add(s.id)
    })
    return ids
  }, [borrador, base])
  const seccionesCambiadas = SECCIONES.filter((s) => borrador.secciones[s.ancla] !== base.secciones[s.ancla]).length
  const cambios = editados.size + seccionesCambiadas

  // Avisar antes de cerrar la pestaña con cambios sin publicar.
  useEffect(() => {
    if (!cambios) return
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", avisar)
    return () => window.removeEventListener("beforeunload", avisar)
  }, [cambios])

  // Lo que ve la vista previa: el borrador con el orden de la lista.
  const contenido = useMemo(() => {
    const vivos = borrador.bloques.filter((b) => !b.eliminado)
    const conOrden = vivos.map((b) => ({ ...b, orden: vivos.filter((o) => o.tipo === b.tipo).indexOf(b) }))
    const equipo = borrador.socios.map((s, i) => ({ ...s, web_orden: i }))
    return contenidoPublico(conOrden, equipo, borrador.secciones)
  }, [borrador])

  // ── Edición del borrador ──
  function cambiarBloque(id: string, cambio: Partial<BorradorBloque>) {
    setBorrador((b) => ({ ...b, bloques: b.bloques.map((x) => (x.id === id ? { ...x, ...cambio } : x)) }))
  }
  function cambiarSocio(id: string, cambio: Partial<SocioWeb>) {
    setBorrador((b) => ({ ...b, socios: b.socios.map((x) => (x.id === id ? { ...x, ...cambio } : x)) }))
  }
  function cambiarSeccion(ancla: ClaveSeccion, visible: boolean) {
    setBorrador((b) => ({ ...b, secciones: { ...b.secciones, [ancla]: visible } }))
  }
  // La foto ya está publicada: va al borrador y a la base, así no cuenta
  // como cambio pendiente.
  function cambiarFoto(id: string, url: string | null) {
    const conFoto = (lista: SocioWeb[]) => lista.map((s) => (s.id === id ? { ...s, web_foto_url: url } : s))
    setBorrador((b) => ({ ...b, socios: conFoto(b.socios) }))
    setBase((b) => ({ ...b, socios: conFoto(b.socios) }))
  }

  function agregar(tipo: TipoBloque) {
    const nuevo: BorradorBloque = {
      id: crypto.randomUUID(),
      tipo,
      orden: 0,
      publicado: true,
      es: {},
      en: {},
      nombre: null,
      empresa: null,
      nuevo: true,
    }
    setBorrador((b) => ({ ...b, bloques: [...b.bloques, nuevo] }))
    setElegido(nuevo.id)
  }

  // Reordenar dentro de la sección: mueve `id` al lugar de `destino`.
  function mover(id: string, destino: string, enEquipo: boolean) {
    if (id === destino) return
    setBorrador((b) => {
      const clave = enEquipo ? "socios" : "bloques"
      const items = [...(b[clave] as { id: string }[])]
      const desde = items.findIndex((x) => x.id === id)
      const hasta = items.findIndex((x) => x.id === destino)
      const [item] = items.splice(desde, 1)
      items.splice(hasta, 0, item)
      return { ...b, [clave]: items }
    })
  }

  function abrirSeccion(s: Seccion) {
    if (abierta === s) {
      setAbierta(null)
      return
    }
    setAbierta(s)
    setElegido(null)
  }

  function publicar() {
    iniciarPublicacion(async () => {
      try {
        await publicarContenido(borrador)
        const publicado = {
          ...borrador,
          bloques: borrador.bloques.filter((b) => !b.eliminado).map((b) => ({ ...b, nuevo: undefined })),
        }
        setBase(publicado)
        setBorrador(publicado)
        toast.success("Publicado. Se ve en zquare.uy en hasta un minuto.")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo publicar")
      }
    })
  }

  const ancla = SECCIONES.find((s) => s.valor === abierta)?.ancla ?? "servicios"

  return (
    // En escritorio ocupa la pantalla entera (ver .zq-editor-web en
    // globals.css): el panel scrollea por dentro y la vista previa llena el resto.
    <div className="zq-editor-web grid escritorio:grid-cols-[360px_minmax(0,1fr)]">
      <aside aria-label="Contenido de la web" className="flex flex-col bg-card escritorio:min-h-0 escritorio:overflow-y-auto escritorio:border-r">
        <div className="flex flex-col gap-3 border-b px-5 pt-5 pb-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="zq-encabezado-titulo m-0 text-2xl leading-[30px]">Contenido</h1>
            <SelectorIdioma idioma={idioma} onIdioma={setIdioma} />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={publicar} disabled={!cambios || publicando}>
              {publicando && <Spinner data-icon="inline-start" />}
              {cambios ? `Publicar ${cambios} ${cambios === 1 ? "cambio" : "cambios"}` : "Todo publicado"}
            </Button>
            {cambios > 0 && (
              <Button variant="outline" onClick={() => setBorrador(base)} disabled={publicando}>
                Descartar
              </Button>
            )}
          </div>
        </div>

        {SECCIONES.map((s) => {
          const abiertaEsta = abierta === s.valor
          const visible = borrador.secciones[s.ancla]
          const enEquipo = s.valor === "equipo"
          const items = enEquipo
            ? borrador.socios
            : borrador.bloques.filter((b) => b.tipo === s.valor && !b.eliminado)
          const cuenta = enEquipo
            ? `${borrador.socios.filter((x) => x.web_visible).length} de ${borrador.socios.length}`
            : String(items.length)
          return (
            <section key={s.valor} aria-label={s.label} className="border-b">
              <div className={cn("flex items-center gap-2 px-3 py-1.5", !visible && "text-muted-foreground")}>
                <button
                  type="button"
                  onClick={() => abrirSeccion(s.valor)}
                  aria-expanded={abiertaEsta}
                  className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent px-2 text-left text-inherit hover:bg-muted"
                >
                  {abiertaEsta ? <ChevronDownIcon className="size-4 shrink-0" aria-hidden="true" /> : <ChevronRightIcon className="size-4 shrink-0" aria-hidden="true" />}
                  <span className="font-bold">{s.label}</span>
                  <span className="text-muted-foreground">· {visible ? cuenta : "oculta"}</span>
                </button>
                <Interruptor activo={visible} onCambio={(v) => cambiarSeccion(s.ancla, v)} label={`Mostrar ${s.label} en la web`} soloIcono />
              </div>

              {abiertaEsta && (
                <div className="flex flex-col gap-1 px-3 pb-3">
                  {!visible && (
                    <p className="m-0 mb-1 rounded-lg bg-muted/70 px-3 py-2 text-xs text-muted-foreground">
                      No aparece en la web ni en su menú. Lo que edites queda listo para cuando la prendas.
                    </p>
                  )}
                  {s.valor === "servicio" && visible && contenido.es.services === undefined && (
                    <p className="m-0 mb-1 rounded-lg bg-aviso/15 px-3 py-2 text-xs">
                      Con menos de 4 servicios publicados, la web sigue mostrando los que tiene escritos.
                    </p>
                  )}
                  {items.map((item) => {
                    const abierto = elegido === item.id
                    const bloque = enEquipo ? null : (item as BorradorBloque)
                    const socio = enEquipo ? (item as SocioWeb) : null
                    const titulo = socio ? socio.nombre : (s.valor === "testimonio" ? bloque?.nombre : bloque?.es.titulo) || "Sin título"
                    const apagado = socio ? !socio.web_visible : !bloque?.publicado
                    return (
                      <div
                        key={item.id}
                        draggable={!abierto}
                        onDragStart={() => setArrastrado(item.id)}
                        onDragOver={(e) => {
                          e.preventDefault()
                          if (arrastrado) mover(arrastrado, item.id, enEquipo)
                        }}
                        onDragEnd={() => setArrastrado(null)}
                        className={cn(
                          "overflow-hidden rounded-[10px]",
                          abierto && "border border-foreground",
                          arrastrado === item.id && "opacity-50"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setElegido(abierto ? null : item.id)}
                          aria-expanded={abierto}
                          className={cn(
                            "flex w-full cursor-pointer items-center gap-2 border-0 px-2.5 py-2.5 text-left text-foreground",
                            abierto ? "bg-muted" : "bg-transparent hover:bg-muted"
                          )}
                        >
                          <GripVerticalIcon className="size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden="true" />
                          {socio && (
                            <span className="inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-[11px] font-bold">
                              {socio.web_foto_url ? (
                                // eslint-disable-next-line @next/next/no-img-element -- miniatura de Storage
                                <img src={socio.web_foto_url} alt="" className="size-full object-cover" />
                              ) : (
                                socio.nombre.slice(0, 1)
                              )}
                            </span>
                          )}
                          <span className={cn("min-w-0 flex-1 truncate", abierto && "font-semibold", apagado && "text-muted-foreground")}>
                            {titulo}
                            {apagado && <span className="font-normal"> · {socio ? "no aparece" : "sin publicar"}</span>}
                          </span>
                          {editados.has(item.id) && <span className="shrink-0 text-[11px] font-semibold text-aviso">Editado</span>}
                          {!abierto && <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                        </button>
                        {abierto && bloque && (
                          <CamposBloque
                            bloque={bloque}
                            idioma={idioma}
                            onCambio={(c) => cambiarBloque(bloque.id, c)}
                            onEliminar={() => {
                              cambiarBloque(bloque.id, { eliminado: true })
                              setElegido(null)
                            }}
                          />
                        )}
                        {abierto && socio && (
                          <CamposSocio
                            socio={socio}
                            idioma={idioma}
                            onCambio={(c) => cambiarSocio(socio.id, c)}
                            onFoto={(url) => cambiarFoto(socio.id, url)}
                          />
                        )}
                      </div>
                    )
                  })}
                  {!enEquipo && (
                    <Button variant="ghost" size="sm" className="self-start" onClick={() => agregar(s.valor as TipoBloque)}>
                      <PlusIcon data-icon="inline-start" />
                      Agregar {TIPOS[s.valor as TipoBloque].singular}
                    </Button>
                  )}
                </div>
              )}
            </section>
          )
        })}
        <p className="m-0 px-5 py-4 text-xs text-muted-foreground">
          Arrastrá para ordenar. Los cambios se ven en zquare.uy en hasta un minuto después de publicar.
        </p>
      </aside>

      <VistaPrevia
        webUrl={webUrl}
        contenido={contenido}
        idioma={idioma}
        seccion={ancla}
        dispositivo={dispositivo}
        onDispositivo={setDispositivo}
      />
    </div>
  )
}

function SelectorIdioma({ idioma, onIdioma }: { idioma: Idioma; onIdioma: (i: Idioma) => void }) {
  return (
    <div className="zq-pildoras" role="group" aria-label="Idioma del texto y de la vista previa">
      {(["es", "en"] as const).map((i) => (
        <button key={i} type="button" aria-pressed={idioma === i} onClick={() => onIdioma(i)} className="zq-pildora-boton" title={i === "es" ? "Español" : "Inglés"}>
          {i.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

function Campo({ label, children, ayuda }: { label: string; children: React.ReactNode; ayuda?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
      {ayuda && <span className="text-xs text-muted-foreground">{ayuda}</span>}
    </label>
  )
}

function Interruptor({
  activo,
  onCambio,
  label,
  soloIcono = false,
}: {
  activo: boolean
  onCambio: (v: boolean) => void
  label: string
  soloIcono?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={soloIcono ? label : undefined}
      title={soloIcono ? label : undefined}
      onClick={() => onCambio(!activo)}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent text-sm text-foreground",
        soloIcono ? "min-h-11 px-1.5" : "p-0"
      )}
    >
      <span className={cn("relative h-[18px] w-8 shrink-0 rounded-full transition-colors", activo ? "bg-lima" : "bg-input")}>
        <span className={cn("absolute top-0.5 size-3.5 rounded-full bg-card shadow-sm transition-[left]", activo ? "left-4" : "left-0.5")} />
      </span>
      {!soloIcono && label}
    </button>
  )
}

function CamposBloque({
  bloque,
  idioma,
  onCambio,
  onEliminar,
}: {
  bloque: BorradorBloque
  idioma: Idioma
  onCambio: (c: Partial<BorradorBloque>) => void
  onEliminar: () => void
}) {
  const def = TIPOS[bloque.tipo]
  return (
    <div className="flex flex-col gap-2.5 p-3">
      {def.compartidos && (
        <div className="grid grid-cols-2 gap-2">
          {def.compartidos.map((c) => (
            <Campo key={c.clave} label={c.label}>
              <Input
                className="h-9"
                value={(bloque[c.clave as "nombre" | "empresa"] as string | null) ?? ""}
                maxLength={c.max}
                onChange={(e) => onCambio({ [c.clave]: e.target.value })}
              />
            </Campo>
          ))}
        </div>
      )}
      {def.campos.map((c, i) => {
        const valor = bloque[idioma]?.[c.clave] ?? ""
        const enEspanol = bloque.es?.[c.clave] ?? ""
        const props = {
          value: valor,
          maxLength: c.max,
          placeholder: idioma === "en" && enEspanol ? `Sin traducir: «${enEspanol.slice(0, 40)}»` : undefined,
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            onCambio({ [idioma]: { ...bloque[idioma], [c.clave]: e.target.value } }),
        }
        return (
          <Campo
            key={`${idioma}.${c.clave}`}
            label={`${c.label}${idioma === "en" ? " (inglés)" : ""}${idioma === "es" && i === 0 ? " *" : ""}`}
            ayuda={c.largo && valor.length > c.max * 0.8 ? `${valor.length} / ${c.max}` : undefined}
          >
            {c.largo ? <Textarea rows={3} {...props} /> : <Input className="h-9" {...props} />}
          </Campo>
        )
      })}
      <div className="flex items-center justify-between pt-1">
        <Interruptor activo={bloque.publicado} onCambio={(v) => onCambio({ publicado: v })} label="Se ve en la web" />
        <Button variant="ghost" size="sm" className="text-negativo hover:text-negativo" onClick={onEliminar}>
          <Trash2Icon data-icon="inline-start" />
          Eliminar
        </Button>
      </div>
    </div>
  )
}

function CamposSocio({
  socio,
  idioma,
  onCambio,
  onFoto,
}: {
  socio: SocioWeb
  idioma: Idioma
  onCambio: (c: Partial<SocioWeb>) => void
  onFoto: (url: string | null) => void
}) {
  const clave = idioma === "es" ? "web_cargo_es" : "web_cargo_en"
  return (
    <div className="flex flex-col gap-3 p-3">
      <FotoSocio socioId={socio.id} nombre={socio.nombre} url={socio.web_foto_url} onCambio={onFoto} />
      <p className="m-0 -mt-1.5 text-xs text-muted-foreground">La foto se recorta cuadrada y se publica al subirla.</p>
      <Campo label={`Cargo${idioma === "en" ? " (inglés)" : ""}`}>
        <Input
          className="h-9"
          value={socio[clave] ?? ""}
          maxLength={80}
          placeholder={
            idioma === "en" && socio.web_cargo_es ? `Sin traducir: «${socio.web_cargo_es}»` : "Ej. Socio · Ingeniería"
          }
          onChange={(e) => onCambio({ [clave]: e.target.value })}
        />
      </Campo>
      <Interruptor activo={socio.web_visible} onCambio={(v) => onCambio({ web_visible: v })} label="Aparece en la web" />
    </div>
  )
}

// Contenido de la web (zquare.uy) que se edita en Web → Contenido. Acá viven
// los campos de cada tipo de bloque (los usa el formulario y la validación)
// y el armado del JSON que lee la web, con la misma forma que su objeto I18N.

export type TipoBloque = "servicio" | "paso" | "testimonio"
export type Idioma = "es" | "en"

export type Bloque = {
  id: string
  tipo: TipoBloque
  orden: number
  publicado: boolean
  es: Record<string, string>
  en: Record<string, string>
  nombre: string | null
  empresa: string | null
}

export type SocioWeb = {
  id: string
  nombre: string
  web_visible: boolean
  web_orden: number
  web_cargo_es: string | null
  web_cargo_en: string | null
}

type Campo = { clave: string; label: string; largo?: boolean; max: number }

export const TIPOS: Record<
  TipoBloque,
  { titulo: string; singular: string; campos: Campo[]; compartidos?: Campo[]; nota?: string }
> = {
  servicio: {
    titulo: "Servicios",
    singular: "servicio",
    campos: [
      { clave: "titulo", label: "Título", max: 80 },
      { clave: "descripcion", label: "Descripción", largo: true, max: 400 },
      { clave: "etiqueta", label: "Etiqueta en el formulario", max: 40 },
    ],
    nota: "El diseño de la web muestra 4 servicios. Con menos de 4 publicados, la web sigue mostrando los que tiene escritos.",
  },
  paso: {
    titulo: "Método",
    singular: "paso",
    campos: [
      { clave: "titulo", label: "Título", max: 60 },
      { clave: "duracion", label: "Duración", max: 40 },
      { clave: "descripcion", label: "Descripción", largo: true, max: 400 },
    ],
  },
  testimonio: {
    titulo: "Testimonios",
    singular: "testimonio",
    compartidos: [
      { clave: "nombre", label: "Nombre", max: 80 },
      { clave: "empresa", label: "Empresa", max: 80 },
    ],
    campos: [
      { clave: "cita", label: "Cita", largo: true, max: 500 },
      { clave: "cargo", label: "Cargo", max: 80 },
    ],
  },
}

export function esTipo(t: string): t is TipoBloque {
  return t in TIPOS
}

// Texto del campo en el idioma pedido; si falta en inglés, el de español.
function campo(b: Bloque, idioma: Idioma, clave: string): string {
  return (b[idioma]?.[clave] || b.es?.[clave] || "").trim()
}

type Lote = {
  services?: [string, string][]
  steps?: [string, string, string][]
  testimonials?: [string, string, string, string][]
  interests?: string[]
  team?: [string, string][]
}

// Lo que lee la web: por idioma, las listas con la forma de su I18N. Una
// lista que no alcanza para el diseño no se manda y la web usa la suya.
export function contenidoPublico(bloques: Bloque[], socios: SocioWeb[]): Record<Idioma, Lote> {
  const publicados = bloques.filter((b) => b.publicado).sort((a, b) => a.orden - b.orden)
  const de = (tipo: TipoBloque) => publicados.filter((b) => b.tipo === tipo)
  const equipo = socios.filter((s) => s.web_visible).sort((a, b) => a.web_orden - b.web_orden)

  const armar = (idioma: Idioma): Lote => {
    const lote: Lote = {}
    const servicios = de("servicio")
    if (servicios.length >= 4) {
      lote.services = servicios.map((b) => [campo(b, idioma, "titulo"), campo(b, idioma, "descripcion")])
      lote.interests = servicios.map((b) => campo(b, idioma, "etiqueta") || campo(b, idioma, "titulo"))
    }
    const pasos = de("paso")
    if (pasos.length > 0) {
      lote.steps = pasos.map((b) => [campo(b, idioma, "titulo"), campo(b, idioma, "duracion"), campo(b, idioma, "descripcion")])
    }
    const testimonios = de("testimonio")
    if (testimonios.length > 0) {
      lote.testimonials = testimonios.map((b) => [
        campo(b, idioma, "cita"),
        b.nombre ?? "",
        campo(b, idioma, "cargo"),
        b.empresa ?? "",
      ])
    }
    if (equipo.length > 0) {
      lote.team = equipo.map((s) => [
        s.nombre,
        ((idioma === "en" ? s.web_cargo_en : s.web_cargo_es) || s.web_cargo_es || "").trim(),
      ])
    }
    return lote
  }

  return { es: armar("es"), en: armar("en") }
}

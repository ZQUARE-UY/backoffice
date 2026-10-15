// Los puntos de una decisión salen de su `detalle`: si viene numerado (o en
// viñetas), un punto por ítem; si no, uno por párrafo. De cada punto se
// separa la primera frase (va en negrita) de la aclaración, y si trae un
// minuto de la reunión ("40:27", "[40:27]", "(min 40:27)") se saca aparte
// para mostrarlo como chip.

export type Punto = { titulo: string; aclaracion: string; minuto: string | null }

const MARCA = /^\s*(\d+[.)]|[-•*])\s+/
const MINUTO = /\s*[[(]?(?:min(?:uto)?\.?\s*)?(\d{1,2}:\d{2}(?::\d{2})?)[\])]?\s*/i

export function puntosDe(detalle: string | null): Punto[] {
  if (!detalle?.trim()) return []
  const lineas = detalle.split("\n").map((l) => l.trim()).filter(Boolean)
  const marcadas = lineas.filter((l) => MARCA.test(l))
  const crudos =
    marcadas.length >= 2
      ? marcadas.map((l) => l.replace(MARCA, ""))
      : detalle.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean)

  return crudos.map((texto) => {
    const m = texto.match(MINUTO)
    const minuto = m ? m[1] : null
    const limpio = (m ? texto.replace(m[0], " ") : texto).replace(/\s+/g, " ").trim()
    // Primera frase: hasta el primer ". ", ": " o " — " con algo después.
    const corte = limpio.search(/(\.|:|\s—)\s+\S/)
    if (corte > 0 && corte < 140) {
      return {
        titulo: limpio.slice(0, corte).trim(),
        aclaracion: limpio.slice(corte + 1).replace(/^[—\s]+/, "").trim(),
        minuto,
      }
    }
    return { titulo: limpio, aclaracion: "", minuto }
  })
}

// Resumen corto para la lista: el detalle en una línea, sin marcas.
export function resumenDe(detalle: string | null): string {
  // Primero las marcas (dependen de los saltos de línea), después los minutos.
  return (detalle ?? "")
    .replace(MARCA, "")
    .replace(/\n\s*(\d+[.)]|[-•*])\s+/g, " · ")
    .replace(new RegExp(MINUTO.source, "gi"), " ")
    .replace(/\s+/g, " ")
    .trim()
}

// ¿Este nombre de participante es un socio? Los participantes se guardan
// como texto libre ("Joaco Márquez", "Nicolás"), así que se compara por
// palabras: alcanza con que coincida el apellido o el nombre.
const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()

export function esSocio(participante: string, socios: { nombre: string }[]): boolean {
  const palabras = normal(participante).split(/[^a-z]+/).filter((p) => p.length >= 3)
  return socios.some((s) => {
    const deSocio = normal(s.nombre).split(/[^a-z]+/).filter((p) => p.length >= 3)
    return palabras.some((p) => deSocio.includes(p))
  })
}

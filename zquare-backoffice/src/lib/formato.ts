import { hoyUruguay } from "@/lib/finanzas"

// Formato de números y fechas del rediseño (docs/REDISENO-BACKOFFICE.md,
// Paso 0). Números en es-UY: punto de miles y coma decimal ("8.169,55"). Los
// montos con moneda siguen saliendo de `formatearMonto` (dominio.ts).
//
// Fechas: cortas ("14 oct.") y relativas cuando están cerca ("Hoy",
// "Mañana", "en 4 días"). Se calculan sobre el día calendario de Montevideo,
// no sobre la hora del servidor (Vercel corre en UTC).

export function formatearNumero(n: number, decimales = 0): string {
  return n.toLocaleString("es-UY", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}

// Abreviaturas rioplatenses: "set." y no "sep." / "sept.".
const MESES = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "set.", "oct.", "nov.", "dic."]

// Acepta "YYYY-MM-DD" (columnas date) o un instante ISO (timestamptz). Un
// instante se lleva al día calendario de Montevideo.
function diaCalendario(fecha: string | Date): string {
  if (typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha
  return new Date(fecha).toLocaleDateString("en-CA", { timeZone: "America/Montevideo" })
}

function aUtc(dia: string): number {
  const [a, m, d] = dia.split("-").map(Number)
  return Date.UTC(a, m - 1, d)
}

// Días desde hoy (Montevideo) hasta la fecha: 0 hoy, 1 mañana, -1 ayer.
export function diasHasta(fecha: string | Date, hoy: string = hoyUruguay()): number {
  return Math.round((aUtc(diaCalendario(fecha)) - aUtc(hoy)) / 86_400_000)
}

// "14 oct." (con el año solo si no es el actual: "14 oct. 2025").
export function fechaCorta(fecha: string | Date, hoy: string = hoyUruguay()): string {
  const dia = diaCalendario(fecha)
  const [a, m, d] = dia.split("-").map(Number)
  const base = `${d} ${MESES[m - 1]}`
  return String(a) === hoy.slice(0, 4) ? base : `${base} ${a}`
}

// "Hoy", "Mañana", "Ayer", "en 4 días", "hace 3 días"; más lejos, la fecha corta.
export function fechaRelativa(fecha: string | Date, hoy: string = hoyUruguay()): string {
  const n = diasHasta(fecha, hoy)
  if (n === 0) return "Hoy"
  if (n === 1) return "Mañana"
  if (n === -1) return "Ayer"
  if (n > 1 && n < 14) return `en ${n} días`
  if (n < -1 && n > -14) return `hace ${-n} días`
  return fechaCorta(fecha, hoy)
}

// Para fechas límite: "Venció hace 15 días", "Vence hoy", "Mañana",
// "18 oct. · en 4 días".
export function vencimiento(fecha: string | Date, hoy: string = hoyUruguay()): string {
  const n = diasHasta(fecha, hoy)
  if (n < -1) return `Venció hace ${-n} días`
  if (n === -1) return "Venció ayer"
  if (n === 0) return "Vence hoy"
  if (n === 1) return "Mañana"
  if (n < 14) return `${fechaCorta(fecha, hoy)} · en ${n} días`
  return fechaCorta(fecha, hoy)
}

// Tono de una fecha límite: negativo si venció, aviso si faltan 7 días o menos.
export function tonoVencimiento(
  fecha: string | Date,
  hoy: string = hoyUruguay()
): "negativo" | "aviso" | null {
  const n = diasHasta(fecha, hoy)
  if (n < 0) return "negativo"
  if (n <= 7) return "aviso"
  return null
}

// Iniciales para el avatar: "Joaquín Márquez" → "JM", "Joaquín" → "JO".
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/[\s@._-]+/).filter(Boolean)
  if (palabras.length === 0) return "?"
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase()
  return (palabras[0][0] + palabras[1][0]).toUpperCase()
}

// Cálculo de huecos comunes para reuniones: álgebra de intervalos sobre
// epoch ms, sin dependencias ni IO. Vive separado de `reuniones.ts` (que sí
// habla con Supabase y Google) para poder importarse desde el editor de
// franjas, que es un client component.
//
// Los intervalos son semiabiertos [inicio, fin): dos franjas contiguas
// (14:00-15:00 y 15:00-16:00) se fusionan en una sola y no se pisan.

export const ZONA_HORARIA = "America/Montevideo"

export type Intervalo = {
  inicio: number
  fin: number
}

const MINUTO = 60_000

// Ordena, descarta vacíos y fusiona los que se solapan o se tocan.
export function normalizar(intervalos: Intervalo[]): Intervalo[] {
  const validos = intervalos
    .filter((i) => i.fin > i.inicio)
    .sort((a, b) => a.inicio - b.inicio)

  const salida: Intervalo[] = []
  for (const actual of validos) {
    const ultimo = salida[salida.length - 1]
    if (ultimo && actual.inicio <= ultimo.fin) {
      ultimo.fin = Math.max(ultimo.fin, actual.fin)
    } else {
      salida.push({ ...actual })
    }
  }
  return salida
}

// Intersección de dos listas ya normalizadas.
export function intersectar(a: Intervalo[], b: Intervalo[]): Intervalo[] {
  const salida: Intervalo[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const inicio = Math.max(a[i].inicio, b[j].inicio)
    const fin = Math.min(a[i].fin, b[j].fin)
    if (fin > inicio) salida.push({ inicio, fin })
    // Avanza el que termina antes: el otro todavía puede cruzarse con el
    // siguiente.
    if (a[i].fin < b[j].fin) i++
    else j++
  }
  return salida
}

// `base` menos `quitar`, ambos normalizados. Un intervalo de `quitar` que cae
// en el medio parte el de `base` en dos.
export function restar(base: Intervalo[], quitar: Intervalo[]): Intervalo[] {
  const salida: Intervalo[] = []
  let j = 0
  for (const actual of base) {
    let inicio = actual.inicio
    // Saltea los que quedaron atrás del intervalo actual.
    while (j < quitar.length && quitar[j].fin <= inicio) j++
    let k = j
    while (k < quitar.length && quitar[k].inicio < actual.fin) {
      if (quitar[k].inicio > inicio) {
        salida.push({ inicio, fin: quitar[k].inicio })
      }
      inicio = Math.max(inicio, quitar[k].fin)
      k++
    }
    if (actual.fin > inicio) salida.push({ inicio, fin: actual.fin })
  }
  return salida
}

// Parte los tramos libres en slots concretos de `duracionMin`, arrancando en
// horas redondas de `pasoMin`. La grilla se calcula sobre epoch, lo que
// coincide con los :00/:30 locales porque el offset de Montevideo es de horas
// enteras; si algún día dejara de serlo habría que alinear con `paredEnZona`.
export function discretizar(
  libres: Intervalo[],
  duracionMin: number,
  opciones: { pasoMin?: number; desde?: number; max?: number } = {}
): Intervalo[] {
  // El tope es una red de contención contra ventanas absurdas, no un límite
  // de uso: tiene que sobrar para una ventana larga con franjas amplias, o se
  // perderían los últimos días (se recorre en orden cronológico).
  const { pasoMin = 30, desde = -Infinity, max = 500 } = opciones
  const duracion = duracionMin * MINUTO
  const paso = pasoMin * MINUTO

  const salida: Intervalo[] = []
  for (const tramo of libres) {
    const arranque = Math.max(tramo.inicio, desde)
    let inicio = Math.ceil(arranque / paso) * paso
    while (inicio + duracion <= tramo.fin) {
      if (salida.length >= max) return salida
      salida.push({ inicio, fin: inicio + duracion })
      inicio += paso
    }
  }
  return salida
}

export function calcularHuecos(params: {
  // Solo de los socios que ya respondieron: los que faltan no restringen.
  franjasPorSocio: Intervalo[][]
  busy: Intervalo[]
  ventana: Intervalo
  duracionMin: number
  desde?: number
  pasoMin?: number
  max?: number
}): Intervalo[] {
  const { franjasPorSocio, busy, ventana, duracionMin, desde, pasoMin, max } =
    params

  if (franjasPorSocio.length === 0) return []
  // Alguien dijo explícitamente que no puede en ninguno de estos días.
  if (franjasPorSocio.some((franjas) => franjas.length === 0)) return []

  let comunes = normalizar([ventana])
  for (const franjas of franjasPorSocio) {
    comunes = intersectar(comunes, normalizar(franjas))
    if (comunes.length === 0) return []
  }

  const libres = restar(comunes, normalizar(busy))
  return discretizar(libres, duracionMin, { pasoMin, desde, max })
}

// ── Zona horaria ──────────────────────────────────────────────────────────
// Conversión entre instantes y hora de pared sin traer una librería de
// fechas: el offset se deriva de Intl, nunca se hardcodea el -03:00.

const partesCache = new Map<string, Intl.DateTimeFormat>()

function formateador(zona: string): Intl.DateTimeFormat {
  let fmt = partesCache.get(zona)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: zona,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    partesCache.set(zona, fmt)
  }
  return fmt
}

// Instante → hora de pared en la zona.
export function paredEnZona(
  ms: number,
  zona = ZONA_HORARIA
): { fecha: string; hora: string } {
  const partes = formateador(zona).formatToParts(new Date(ms))
  const buscar = (tipo: string) =>
    partes.find((p) => p.type === tipo)?.value ?? "00"
  // "24" en lugar de "00" a medianoche es una rareza conocida de hour12:false.
  const hora = buscar("hour") === "24" ? "00" : buscar("hour")
  return {
    fecha: `${buscar("year")}-${buscar("month")}-${buscar("day")}`,
    hora: `${hora}:${buscar("minute")}`,
  }
}

export const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/
// "24:00" es válido como fin de día; "24:30" no existe.
export const FORMATO_HORA = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/

// Hora de pared en la zona → instante. Interpreta el par como si fuera UTC y
// corrige por la diferencia observada; la segunda pasada cubre los saltos de
// horario de verano (Uruguay no tiene desde 2015, pero la zona podría cambiar).
// Devuelve NaN si el par no es una fecha real: quien llama decide qué hacer.
export function instanteEnZona(
  fecha: string,
  hora: string,
  zona = ZONA_HORARIA
): number {
  // "24:00" es el final del día, que Date.parse no acepta.
  if (hora === "24:00") {
    return instanteEnZona(sumarDias(fecha, 1), "00:00", zona)
  }
  const objetivo = Date.parse(`${fecha}T${hora}:00Z`)
  if (!Number.isFinite(objetivo)) return NaN
  let candidato = objetivo
  for (let i = 0; i < 2; i++) {
    const pared = paredEnZona(candidato, zona)
    const visto = Date.parse(`${pared.fecha}T${pared.hora}:00Z`)
    const desvio = objetivo - visto
    if (desvio === 0) break
    candidato += desvio
  }
  return candidato
}

// Corta los intervalos en cada medianoche local, de modo que ninguno cruce de
// un día al otro. El editor de franjas trabaja por día: si guardáramos un
// intervalo a caballo entre dos, al releerlo aparecería bajo un solo día y se
// perdería el resto.
export function partirPorDia(
  intervalos: Intervalo[],
  zona = ZONA_HORARIA
): Intervalo[] {
  const salida: Intervalo[] = []
  for (const intervalo of intervalos) {
    let inicio = intervalo.inicio
    // Tope defensivo por si una franja viniera con un rango disparatado.
    for (let i = 0; i < 90 && inicio < intervalo.fin; i++) {
      const dia = paredEnZona(inicio, zona).fecha
      const medianoche = instanteEnZona(sumarDias(dia, 1), "00:00", zona)
      const fin = Math.min(medianoche, intervalo.fin)
      salida.push({ inicio, fin })
      inicio = fin
    }
  }
  return salida
}

// Pasa las franjas guardadas (instantes) a la forma que edita el socio: horas
// de pared agrupadas por día. Una franja que llega hasta la medianoche se
// muestra terminando a las 23:59, que es lo máximo que acepta un input de
// hora; al guardar, `guardarRespuestaDe` vuelve a leer 23:59 como fin del día,
// así el ida y vuelta por el editor no recorta el último slot.
export function franjasPorDia(
  franjas: Intervalo[],
  zona = ZONA_HORARIA
): Record<string, { desde: string; hasta: string }[]> {
  const porDia: Record<string, { desde: string; hasta: string }[]> = {}
  for (const franja of partirPorDia(franjas, zona)) {
    const desde = paredEnZona(franja.inicio, zona)
    const hasta = paredEnZona(franja.fin, zona)
    const dia = porDia[desde.fecha] ?? []
    dia.push({
      desde: desde.hora,
      hasta: hasta.fecha === desde.fecha ? hasta.hora : "23:59",
    })
    porDia[desde.fecha] = dia
  }
  return porDia
}

// Suma días de calendario a una fecha "YYYY-MM-DD" sin salir de la zona.
export function sumarDias(fecha: string, dias: number): string {
  const base = Date.parse(`${fecha}T12:00:00Z`)
  return new Date(base + dias * 24 * 60 * MINUTO).toISOString().slice(0, 10)
}

// Días de calendario entre dos fechas "YYYY-MM-DD", inclusive ambos extremos.
export function diasDeVentana(desde: string, hasta: string): string[] {
  const dias: string[] = []
  let actual = desde
  // Tope defensivo: la migración ya limita la ventana a 60 días.
  while (actual <= hasta && dias.length < 90) {
    dias.push(actual)
    actual = sumarDias(actual, 1)
  }
  return dias
}

// ── Etiquetas ─────────────────────────────────────────────────────────────

// "mar 5 de agosto", o "Hoy" / "Mañana" cuando corresponde.
export function etiquetaDia(ms: number, zona = ZONA_HORARIA): string {
  const hoy = paredEnZona(Date.now(), zona).fecha
  const fecha = paredEnZona(ms, zona).fecha
  if (fecha === hoy) return "Hoy"
  if (fecha === sumarDias(hoy, 1)) return "Mañana"
  return new Date(ms).toLocaleDateString("es-UY", {
    timeZone: zona,
    weekday: "short",
    day: "numeric",
    month: "long",
  })
}

export function etiquetaHora(ms: number, zona = ZONA_HORARIA): string {
  return new Date(ms).toLocaleTimeString("es-UY", {
    timeZone: zona,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

// "mar 5 de agosto, 14:00 a 14:30"
export function etiquetaHueco(hueco: Intervalo, zona = ZONA_HORARIA): string {
  return `${etiquetaDia(hueco.inicio, zona)}, ${etiquetaHora(hueco.inicio, zona)} a ${etiquetaHora(hueco.fin, zona)}`
}

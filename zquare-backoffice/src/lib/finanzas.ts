import type { SupabaseClient } from "@supabase/supabase-js"

import type { BalanceSocio, MovimientoRecurrente } from "@/lib/dominio"

// Lógica de finanzas compartida entre la página, el cron diario y el MCP.

// "Hoy" en Uruguay como YYYY-MM-DD. El servidor corre en UTC: a las 22 h de
// Montevideo ya es mañana en UTC, y un gasto del día 5 se confirmaría el 4.
export function hoyUruguay(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Montevideo",
  })
}

function diasDelMes(anio: number, mes: number): number {
  // mes 1-12; el día 0 del mes siguiente es el último de este.
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

// Fecha de la ocurrencia número `n` (0 = la primera) de una plantilla. El día
// sale de la fecha de inicio; en los meses que no lo tienen (un 31 en
// febrero) cae en el último día del mes.
export function ocurrencia(
  fechaInicio: string,
  frecuencia: MovimientoRecurrente["frecuencia"],
  n: number,
): string {
  const [a0, m0, d0] = fechaInicio.split("-").map(Number)
  const meses = frecuencia === "mensual" ? m0 - 1 + n : m0 - 1 + 12 * n
  const anio = a0 + Math.floor(meses / 12)
  const mes = (meses % 12) + 1
  const dia = Math.min(d0, diasDelMes(anio, mes))
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
}

// La próxima ocurrencia a partir de hoy (inclusive), o null si la plantilla
// ya terminó.
export function proximaOcurrencia(
  r: Pick<MovimientoRecurrente, "fecha_inicio" | "fecha_fin" | "frecuencia">,
  hoy = hoyUruguay(),
): string | null {
  for (let n = 0; n < TOPE_OCURRENCIAS; n++) {
    const fecha = ocurrencia(r.fecha_inicio, r.frecuencia, n)
    if (r.fecha_fin && fecha > r.fecha_fin) return null
    if (fecha >= hoy) return fecha
  }
  return null
}

// Tope de seguridad: 10 años de un mensual. Una fecha de inicio muy vieja no
// debería generar cientos de movimientos de golpe.
const TOPE_OCURRENCIAS = 120

// Equivalente mensual en USD, para mostrar cuánto pesan los recurrentes.
export function mensualUsd(
  r: Pick<MovimientoRecurrente, "monto" | "tc_a_usd" | "frecuencia">,
): number {
  const usd = r.monto / r.tc_a_usd
  return r.frecuencia === "anual" ? usd / 12 : usd
}

// Convierte las plantillas activas en movimientos. Idempotente: se puede
// correr las veces que haga falta.
//   - Cada ocurrencia vencida (≤ hoy) existe como `confirmado`.
//   - La próxima ocurrencia existe como `previsto`, para que se vea en lo
//     comprometido.
//   - Los previstos que ya vencieron pasan a `confirmado`.
//   - Los previstos futuros de plantillas pausadas o borradas se eliminan.
// El unique (recurrente_id, fecha) hace que una ocurrencia borrada a mano no
// se vuelva a generar.
export async function sincronizarRecurrentes(
  supabase: SupabaseClient,
  hoy = hoyUruguay(),
): Promise<{ generados: number; confirmados: number; errores: string[] }> {
  const errores: string[] = []

  const { data: plantillas, error } = await supabase
    .from("movimientos_recurrentes")
    .select("*")
  if (error) return { generados: 0, confirmados: 0, errores: [error.message] }

  const todas = (plantillas ?? []) as MovimientoRecurrente[]
  const vigentes = todas.filter((r) => r.activo && !r.deleted_at)
  const apagadas = todas.filter((r) => !r.activo || r.deleted_at)

  if (apagadas.length > 0) {
    const { error: errorBorrado } = await supabase
      .from("movimientos")
      .delete()
      .in(
        "recurrente_id",
        apagadas.map((r) => r.id),
      )
      .eq("estado", "previsto")
      .gt("fecha", hoy)
    if (errorBorrado) errores.push(errorBorrado.message)
  }

  let generados = 0
  for (const r of vigentes) {
    const fechas: string[] = []
    for (let n = 0; n < TOPE_OCURRENCIAS; n++) {
      const fecha = ocurrencia(r.fecha_inicio, r.frecuencia, n)
      if (r.fecha_fin && fecha > r.fecha_fin) break
      fechas.push(fecha)
      if (fecha > hoy) break
    }
    if (fechas.length === 0) continue

    const filas = fechas.map((fecha) => ({
      tipo: r.tipo,
      estado: fecha <= hoy ? "confirmado" : "previsto",
      fecha,
      moneda: r.moneda,
      monto: r.monto,
      tc_a_usd: r.tc_a_usd,
      categoria: r.categoria,
      descripcion: r.descripcion,
      socio_id: r.socio_id,
      cliente_id: r.cliente_id,
      proyecto_id: r.proyecto_id,
      recurrente_id: r.id,
      created_by: r.created_by,
      metadata: { origen: "recurrente" },
    }))

    // ignoreDuplicates: solo devuelve las filas que realmente se insertaron.
    const { data: insertados, error: errorInsert } = await supabase
      .from("movimientos")
      .upsert(filas, {
        onConflict: "recurrente_id,fecha",
        ignoreDuplicates: true,
      })
      .select("id")
    if (errorInsert) {
      errores.push(`${r.descripcion}: ${errorInsert.message}`)
      continue
    }
    generados += insertados?.length ?? 0

    // El reparto se copia solo si la plata la mueve un socio (ver
    // movimiento_reparto); vacío = partes iguales, no hace falta guardarlo.
    if (r.socio_id && r.reparto.length > 0 && insertados?.length) {
      const { error: errorReparto } = await supabase
        .from("movimiento_participaciones")
        .insert(
          insertados.flatMap((m) =>
            r.reparto.map((p) => ({
              movimiento_id: m.id,
              socio_id: p.socio_id,
              partes: p.partes,
            })),
          ),
        )
      if (errorReparto) errores.push(`${r.descripcion}: ${errorReparto.message}`)
    }
  }

  const { data: confirmados, error: errorConfirmar } = await supabase
    .from("movimientos")
    .update({ estado: "confirmado" })
    .not("recurrente_id", "is", null)
    .eq("estado", "previsto")
    .lte("fecha", hoy)
    .is("deleted_at", null)
    .select("id")
  if (errorConfirmar) errores.push(errorConfirmar.message)

  return { generados, confirmados: confirmados?.length ?? 0, errores }
}

// Borra los previstos futuros de una plantilla, para que la próxima
// sincronización los regenere con los datos nuevos (al editarla) o no los
// regenere (al pausarla o borrarla). Son proyecciones, no registros: se
// borran de verdad, así liberan el unique (recurrente_id, fecha).
export async function borrarPrevistosFuturos(
  supabase: SupabaseClient,
  recurrenteId: string,
  hoy = hoyUruguay(),
) {
  const { error } = await supabase
    .from("movimientos")
    .delete()
    .eq("recurrente_id", recurrenteId)
    .eq("estado", "previsto")
    .gt("fecha", hoy)
  if (error) throw new Error(error.message)
}

export type TransferenciaSugerida = {
  de_socio_id: string
  para_socio_id: string
  monto_usd: number
}

// Cómo saldar el balance con la menor cantidad de transferencias: el que más
// debe le paga al que más le deben, hasta que alguno de los dos queda en cero.
// Con cuatro socios da como mucho tres transferencias.
export function transferenciasSugeridas(
  balance: Pick<BalanceSocio, "socio_id" | "saldo_usd">[],
): TransferenciaSugerida[] {
  const centavos = (n: number) => Math.round(n * 100)
  const deudores = balance
    .filter((b) => centavos(b.saldo_usd) < 0)
    .map((b) => ({ id: b.socio_id, resto: -centavos(b.saldo_usd) }))
    .sort((a, b) => b.resto - a.resto)
  const acreedores = balance
    .filter((b) => centavos(b.saldo_usd) > 0)
    .map((b) => ({ id: b.socio_id, resto: centavos(b.saldo_usd) }))
    .sort((a, b) => b.resto - a.resto)

  const resultado: TransferenciaSugerida[] = []
  let i = 0
  let j = 0
  while (i < deudores.length && j < acreedores.length) {
    const monto = Math.min(deudores[i].resto, acreedores[j].resto)
    // El centavo que sobra del redondeo de las cuotas no amerita transferencia.
    if (monto > 1) {
      resultado.push({
        de_socio_id: deudores[i].id,
        para_socio_id: acreedores[j].id,
        monto_usd: monto / 100,
      })
    }
    deudores[i].resto -= monto
    acreedores[j].resto -= monto
    if (deudores[i].resto <= 0) i++
    if (acreedores[j].resto <= 0) j++
  }
  return resultado
}

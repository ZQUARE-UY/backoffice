import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Element, Root } from "hast"
import rehypeStringify from "rehype-stringify"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"
import { visit } from "unist-util-visit"

import { formatearMonto } from "@/lib/dominio"
import {
  asegurarCarpeta,
  crearCarpetaCliente,
  driveConfigurado,
  guardarDocumentoHtml,
  guardarPdfDeDoc,
} from "@/lib/drive"
import { codigoPresupuesto } from "@/lib/presupuestos"

// El Google Doc de una propuesta: el contenido en Markdown del presupuesto,
// convertido a HTML con la identidad de ZQUARE y subido a Drive, donde Drive
// lo convierte a Doc. La tabla de inversión no sale del texto sino de los
// ítems, para que el documento no pueda contradecir al presupuesto.
//
// Identidad PROVISORIA (2026-09-30): colores de la papelería de la
// diseñadora y fuentes de Google parecidas. Cuando lleguen logo y tipografía
// reales se cambian acá, en ESTILO.
const ESTILO = {
  tinta: "#1E242B",
  tintaSuave: "#5A6168",
  acento: "#D5E27A",
  linea: "#DCE0DA",
  titulos: "Outfit",
  texto: "Inter",
}

// Días que vale la propuesta desde que se genera el documento.
const VALIDEZ_DIAS = 30

type ItemDocumento = {
  descripcion: string
  horas: number | null
  tarifa: number
  subtotal: number
}

type MetadataDocumento = {
  drive_file_id?: string
  drive_folder_id?: string
  documento_generado_at?: string
  pdf_file_id?: string
  pdf_url?: string
  congelado_at?: string
  [clave: string]: unknown
}

type PresupuestoParaDocumento = {
  id: string
  numero: number
  titulo: string | null
  version: number
  estado: string
  moneda: string
  total: number
  contenido: string | null
  metadata: MetadataDocumento | null
  clientes: { id: string; nombre: string; drive_folder_id: string | null } | null
  presupuesto_items: (ItemDocumento & { orden: number })[]
}

function nombreDocumento(p: PresupuestoParaDocumento): string {
  return `${p.titulo ?? "Presupuesto"} v${p.version} — ${p.clientes?.nombre ?? "Cliente"}`
}

// ── Tabla de inversión ────────────────────────────────────────────────────

function celda(texto: string): string {
  return texto.replace(/\|/g, "\\|").replace(/\n/g, " ")
}

export function tablaInversion(items: ItemDocumento[], moneda: string, total: number): string {
  const filas = items.map((it) => {
    const detalle =
      it.horas != null
        ? ` (${it.horas.toLocaleString("es-UY")} h × ${formatearMonto(it.tarifa, moneda)})`
        : ""
    return `| ${celda(it.descripcion + detalle)} | ${formatearMonto(it.subtotal, moneda)} |`
  })
  return [
    "| Concepto | Inversión |",
    "| --- | ---: |",
    ...filas,
    `| **Total** | **${formatearMonto(total, moneda)} + IVA** |`,
  ].join("\n")
}

// La tabla va inmediatamente después del título "Inversión" del contenido,
// antes de las notas (IVA, forma de pago, validez). Si el contenido no tiene
// esa sección, se agrega antes de "Costos operativos" o, si tampoco está, al
// final.
export function insertarInversion(contenido: string, tabla: string): string {
  const lineas = contenido.split("\n")
  const i = lineas.findIndex((l) => /^#{1,3}\s+inversi[oó]n\b/i.test(l.trim()))
  if (i !== -1) {
    lineas.splice(i + 1, 0, "", tabla, "")
    return lineas.join("\n")
  }
  const seccion = ["## Inversión", "", tabla, ""]
  const j = lineas.findIndex((l) => /^#{1,3}\s+costos operativos\b/i.test(l.trim()))
  if (j !== -1) {
    lineas.splice(j, 0, ...seccion)
    return lineas.join("\n")
  }
  return [...lineas, "", ...seccion].join("\n")
}

// ── HTML con estilos en línea ─────────────────────────────────────────────
// La importación de Drive ignora casi todo el CSS de <style>, pero respeta
// los estilos en línea: por eso cada elemento lleva el suyo.

const ESTILOS_POR_ETIQUETA: Record<string, string> = {
  h1: `font-family:${ESTILO.titulos};font-size:22pt;font-weight:700;color:${ESTILO.tinta};margin:18pt 0 6pt`,
  h2: `font-family:${ESTILO.titulos};font-size:16pt;font-weight:600;color:${ESTILO.tinta};margin:18pt 0 6pt`,
  h3: `font-family:${ESTILO.titulos};font-size:12.5pt;font-weight:600;color:${ESTILO.tinta};margin:12pt 0 4pt`,
  h4: `font-family:${ESTILO.titulos};font-size:11pt;font-weight:600;color:${ESTILO.tinta};margin:10pt 0 4pt`,
  p: `font-family:${ESTILO.texto};font-size:10.5pt;line-height:1.5;color:${ESTILO.tinta};margin:0 0 8pt`,
  li: `font-family:${ESTILO.texto};font-size:10.5pt;line-height:1.5;color:${ESTILO.tinta}`,
  table: `border-collapse:collapse;width:100%;margin:6pt 0 12pt`,
  th: `font-family:${ESTILO.texto};font-size:9.5pt;font-weight:600;color:#FFFFFF;background-color:${ESTILO.tinta};padding:6pt 8pt;border:1px solid ${ESTILO.tinta};text-align:left`,
  td: `font-family:${ESTILO.texto};font-size:10pt;color:${ESTILO.tinta};padding:6pt 8pt;border:1px solid ${ESTILO.linea};vertical-align:top`,
  blockquote: `border-left:3px solid ${ESTILO.acento};margin:0 0 8pt;padding-left:10pt;color:${ESTILO.tintaSuave}`,
  a: `color:${ESTILO.tinta};text-decoration:underline`,
  code: `font-family:'Roboto Mono';font-size:9.5pt`,
}

function estilosEnLinea() {
  return (arbol: Root) => {
    visit(arbol, "element", (nodo: Element) => {
      const estilo = ESTILOS_POR_ETIQUETA[nodo.tagName]
      if (!estilo) return
      // La alineación de columnas de GFM llega como `align`; se conserva.
      const alineacion = nodo.properties?.align ? `;text-align:${nodo.properties.align}` : ""
      nodo.properties = { ...nodo.properties, style: estilo + alineacion }
    })
  }
}

async function markdownAHtml(markdown: string): Promise<string> {
  const archivo = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(estilosEnLinea)
    .use(rehypeStringify)
    .process(markdown)
  return String(archivo)
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function fechaLarga(fecha: Date): string {
  return fecha.toLocaleDateString("es-UY", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Montevideo",
  })
}

// Membrete: bloque al principio del documento (no el encabezado de página,
// que necesita la API de Docs y el logo; queda para cuando lleguen).
function membrete(p: PresupuestoParaDocumento, hoy: Date): string {
  const vence = new Date(hoy.getTime() + VALIDEZ_DIAS * 86_400_000)
  const datos = [
    `Propuesta para ${escaparHtml(p.clientes?.nombre ?? "")}`,
    fechaLarga(hoy),
    codigoPresupuesto(p.numero) + (p.version > 1 ? ` · versión ${p.version}` : ""),
    `Válida hasta el ${fechaLarga(vence)}`,
  ].join("  ·  ")
  return [
    `<p style="font-family:${ESTILO.titulos};font-size:13pt;font-weight:700;letter-spacing:3pt;color:${ESTILO.tinta};margin:0 0 2pt">ZQUARE</p>`,
    `<p style="font-family:${ESTILO.texto};font-size:8.5pt;color:${ESTILO.tintaSuave};margin:0 0 18pt;padding-bottom:6pt;border-bottom:3px solid ${ESTILO.acento}">zquare.uy</p>`,
    `<h1 style="${ESTILOS_POR_ETIQUETA.h1};font-size:26pt;margin:0 0 4pt">${escaparHtml(p.titulo ?? "Propuesta")}</h1>`,
    `<p style="font-family:${ESTILO.texto};font-size:9.5pt;color:${ESTILO.tintaSuave};margin:0 0 18pt">${datos}</p>`,
  ].join("\n")
}

export async function htmlDocumento(p: PresupuestoParaDocumento, hoy = new Date()): Promise<string> {
  const items = [...p.presupuesto_items].sort((a, b) => a.orden - b.orden)
  const contenido = insertarInversion(
    p.contenido ?? "",
    tablaInversion(items, p.moneda, Number(p.total))
  )
  const cuerpo = await markdownAHtml(contenido)
  return [
    `<html><head><meta charset="utf-8"><title>${escaparHtml(nombreDocumento(p))}</title></head>`,
    `<body style="font-family:${ESTILO.texto};color:${ESTILO.tinta};background-color:#FFFFFF">`,
    membrete(p, hoy),
    cuerpo,
    "</body></html>",
  ].join("\n")
}

// ── Guardado en Drive ─────────────────────────────────────────────────────

const COLUMNAS =
  "id, numero, titulo, version, estado, moneda, total, contenido, metadata, clientes(id, nombre, drive_folder_id), presupuesto_items(descripcion, horas, tarifa, subtotal, orden)"

async function leerPresupuesto(
  supabase: SupabaseClient,
  id: string
): Promise<PresupuestoParaDocumento> {
  const { data, error } = await supabase
    .from("presupuestos")
    .select(COLUMNAS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<PresupuestoParaDocumento>()
  if (error) throw new Error(error.message)
  if (!data) throw new Error("No encontré el presupuesto")
  return data
}

// Carpeta `Presupuestos/` del cliente; si el cliente todavía no tiene carpeta
// en Drive, se le crea la estructura estándar (igual que al darlo de alta).
async function carpetaPresupuestos(
  supabase: SupabaseClient,
  cliente: NonNullable<PresupuestoParaDocumento["clientes"]>
): Promise<string> {
  let carpetaCliente = cliente.drive_folder_id
  if (!carpetaCliente) {
    carpetaCliente = await crearCarpetaCliente(cliente.nombre)
    const { error } = await supabase
      .from("clientes")
      .update({ drive_folder_id: carpetaCliente })
      .eq("id", cliente.id)
    if (error) throw new Error(error.message)
  }
  return asegurarCarpeta("Presupuestos", carpetaCliente)
}

export type ResultadoDocumento = { url: string; nombre: string; regenerado: boolean }

// Genera (o regenera, mientras está en borrador) el Google Doc de un
// presupuesto. Un presupuesto ya enviado con documento no se toca: lo que se
// mandó queda como está y los cambios van en una versión nueva.
export async function generarDocumentoPresupuesto(
  supabase: SupabaseClient,
  presupuestoId: string
): Promise<ResultadoDocumento> {
  if (!driveConfigurado()) throw new Error("Drive no está configurado en este entorno")
  const p = await leerPresupuesto(supabase, presupuestoId)
  const metadata = p.metadata ?? {}
  const codigo = codigoPresupuesto(p.numero)

  if (p.estado !== "borrador" && metadata.drive_file_id) {
    throw new Error(
      `${codigo} ya está ${p.estado}: su documento quedó como se envió. Para cambiarlo, creá la versión siguiente.`
    )
  }
  if (!p.contenido?.trim()) {
    throw new Error(`${codigo} no tiene la propuesta escrita todavía (campo contenido).`)
  }
  if (!p.clientes) throw new Error(`${codigo} no tiene cliente`)
  if (p.presupuesto_items.length === 0) throw new Error(`${codigo} no tiene ítems`)

  const carpeta = metadata.drive_folder_id ?? (await carpetaPresupuestos(supabase, p.clientes))
  const nombre = nombreDocumento(p)
  const html = await htmlDocumento(p)
  const doc = await guardarDocumentoHtml(nombre, carpeta, html, metadata.drive_file_id)

  const { error } = await supabase
    .from("presupuestos")
    .update({
      drive_url: doc.url,
      metadata: {
        ...metadata,
        drive_file_id: doc.id,
        drive_folder_id: carpeta,
        documento_generado_at: new Date().toISOString(),
      },
    })
    .eq("id", p.id)
  if (error) throw new Error(error.message)

  return { url: doc.url, nombre, regenerado: Boolean(metadata.drive_file_id) }
}

// Al marcar un presupuesto como enviado: guarda un PDF de su Doc en la misma
// carpeta. Devuelve null si no hay Doc que congelar (se envió por otra vía).
// Idempotente: si ya tiene PDF, devuelve ese.
export async function congelarDocumentoEnviado(
  supabase: SupabaseClient,
  presupuestoId: string
): Promise<string | null> {
  const p = await leerPresupuesto(supabase, presupuestoId)
  const metadata = p.metadata ?? {}
  if (metadata.pdf_url) return metadata.pdf_url
  if (!metadata.drive_file_id || !metadata.drive_folder_id) return null
  if (!driveConfigurado()) throw new Error("Drive no está configurado en este entorno")

  const pdf = await guardarPdfDeDoc(
    metadata.drive_file_id,
    `${nombreDocumento(p)}.pdf`,
    metadata.drive_folder_id
  )
  const { error } = await supabase
    .from("presupuestos")
    .update({
      metadata: {
        ...metadata,
        pdf_file_id: pdf.id,
        pdf_url: pdf.url,
        congelado_at: new Date().toISOString(),
      },
    })
    .eq("id", p.id)
  if (error) throw new Error(error.message)
  return pdf.url
}

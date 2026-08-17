import "server-only"

import { google } from "googleapis"

import { clienteJwt, googleConfigurado } from "@/lib/google"

const SCOPES = ["https://www.googleapis.com/auth/drive"]

function driveClient() {
  return google.drive({ version: "v3", auth: clienteJwt(SCOPES) })
}

// Id de la Unidad compartida "ZQUARE".
export function sharedDriveId(): string {
  const id = process.env.GOOGLE_DRIVE_SHARED_ID
  if (!id) throw new Error("Falta GOOGLE_DRIVE_SHARED_ID")
  return id
}

export function driveConfigurado(): boolean {
  return googleConfigurado() && Boolean(process.env.GOOGLE_DRIVE_SHARED_ID)
}

export type ArchivoDrive = {
  id: string
  nombre: string
  esCarpeta: boolean
  url: string
  iconUrl: string | null
  modificado: string | null
}

const CARPETA_MIME = "application/vnd.google-apps.folder"

// Busca una subcarpeta por nombre dentro de un padre; si no existe, la crea.
async function asegurarCarpeta(
  nombre: string,
  padreId: string
): Promise<string> {
  const drive = driveClient()
  const escapado = nombre.replace(/'/g, "\\'")
  const { data } = await drive.files.list({
    q: `name = '${escapado}' and mimeType = '${CARPETA_MIME}' and '${padreId}' in parents and trashed = false`,
    fields: "files(id, name)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "drive",
    driveId: sharedDriveId(),
  })

  const existente = data.files?.[0]
  if (existente?.id) return existente.id

  const { data: creada } = await drive.files.create({
    requestBody: { name: nombre, mimeType: CARPETA_MIME, parents: [padreId] },
    fields: "id",
    supportsAllDrives: true,
  })
  if (!creada.id) throw new Error(`No se pudo crear la carpeta ${nombre}`)
  return creada.id
}

// Crea (o reutiliza) la carpeta de un cliente dentro de "Clientes/", con sus
// subcarpetas estándar. Devuelve el id de la carpeta del cliente.
export async function crearCarpetaCliente(nombre: string): Promise<string> {
  const clientesId = await asegurarCarpeta("Clientes", sharedDriveId())
  const clienteId = await asegurarCarpeta(nombre, clientesId)
  await Promise.all([
    asegurarCarpeta("Contrato", clienteId),
    asegurarCarpeta("Minutas", clienteId),
    asegurarCarpeta("Presupuestos", clienteId),
    asegurarCarpeta("Proyectos", clienteId),
  ])
  return clienteId
}

// Crea (o reutiliza) la carpeta de un proyecto dentro de Proyectos/ del
// cliente, con sus subcarpetas estándar.
export async function crearCarpetaProyecto(
  nombre: string,
  carpetaClienteId: string
): Promise<string> {
  const proyectosId = await asegurarCarpeta("Proyectos", carpetaClienteId)
  const proyectoId = await asegurarCarpeta(nombre, proyectosId)
  await Promise.all([
    asegurarCarpeta("Analisis y propuesta", proyectoId),
    asegurarCarpeta("Presentaciones", proyectoId),
    asegurarCarpeta("Entregables", proyectoId),
  ])
  return proyectoId
}

export async function listarArchivos(
  carpetaId: string
): Promise<ArchivoDrive[]> {
  const drive = driveClient()
  const { data } = await drive.files.list({
    q: `'${carpetaId}' in parents and trashed = false`,
    fields:
      "files(id, name, mimeType, webViewLink, iconLink, modifiedTime)",
    orderBy: "folder,name",
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "drive",
    driveId: sharedDriveId(),
  })

  return (data.files ?? []).map((f) => ({
    id: f.id!,
    nombre: f.name ?? "(sin nombre)",
    esCarpeta: f.mimeType === CARPETA_MIME,
    url: f.webViewLink ?? `https://drive.google.com/drive/folders/${f.id}`,
    iconUrl: f.iconLink ?? null,
    modificado: f.modifiedTime ?? null,
  }))
}

export function urlCarpeta(carpetaId: string): string {
  return `https://drive.google.com/drive/folders/${carpetaId}`
}

export type ArchivoDriveIndexable = {
  id: string
  nombre: string
  mimeType: string
  url: string
  modificado: string
  tamano: number
}

// Lista TODOS los archivos (no carpetas) de la unidad compartida en una sola
// consulta paginada — para el índice de búsqueda semántica.
export async function listarTodosLosArchivos(): Promise<
  ArchivoDriveIndexable[]
> {
  const drive = driveClient()
  const archivos: ArchivoDriveIndexable[] = []
  let pageToken: string | undefined

  do {
    const { data } = await drive.files.list({
      q: `mimeType != '${CARPETA_MIME}' and trashed = false`,
      fields:
        "nextPageToken, files(id, name, mimeType, webViewLink, modifiedTime, size)",
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: "drive",
      driveId: sharedDriveId(),
    })
    for (const f of data.files ?? []) {
      archivos.push({
        id: f.id!,
        nombre: f.name ?? "(sin nombre)",
        mimeType: f.mimeType ?? "",
        url: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
        modificado: f.modifiedTime ?? new Date(0).toISOString(),
        tamano: f.size ? Number(f.size) : 0,
      })
    }
    pageToken = data.nextPageToken ?? undefined
  } while (pageToken)

  return archivos
}

export type ArchivoDriveConRuta = ArchivoDriveIndexable & {
  // Carpetas desde la raíz hasta la que contiene el archivo, ya resueltas.
  // `ruta` son los nombres (para mostrar) y `rutaIds` los ids en el mismo
  // orden: con esos se cruza contra `drive_folder_id` de clientes y proyectos
  // para saber de quién es el archivo sin depender de los nombres.
  ruta: string[]
  rutaIds: string[]
  carpetaId: string | null
}

// Todos los archivos de la unidad, cada uno con la ruta de carpetas que lo
// contiene — lo que necesita /documentos para mostrar de qué cliente y
// proyecto es cada archivo sin que nadie lo haya registrado a mano.
//
// Son dos consultas: los archivos (con `parents`) y las carpetas (para poder
// subir la cadena hasta la raíz). Drive no devuelve la ruta completa de un
// archivo; hay que armarla.
export async function listarArchivosConRuta(): Promise<ArchivoDriveConRuta[]> {
  const drive = driveClient()

  const carpetas = new Map<string, { nombre: string; padre: string | null }>()
  let tokenCarpetas: string | undefined
  do {
    const { data } = await drive.files.list({
      q: `mimeType = '${CARPETA_MIME}' and trashed = false`,
      fields: "nextPageToken, files(id, name, parents)",
      pageSize: 1000,
      pageToken: tokenCarpetas,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: "drive",
      driveId: sharedDriveId(),
    })
    for (const f of data.files ?? []) {
      if (!f.id) continue
      carpetas.set(f.id, {
        nombre: f.name ?? "(sin nombre)",
        padre: f.parents?.[0] ?? null,
      })
    }
    tokenCarpetas = data.nextPageToken ?? undefined
  } while (tokenCarpetas)

  // Sube la cadena de padres hasta la raíz de la unidad. El corte por
  // profundidad es un seguro contra un ciclo: un atajo mal hecho en Drive no
  // tiene por qué colgar la pantalla.
  function rutaDe(carpetaId: string | null): { ruta: string[]; rutaIds: string[] } {
    const ruta: string[] = []
    const rutaIds: string[] = []
    let actual = carpetaId
    for (let i = 0; actual && i < 20; i++) {
      const carpeta = carpetas.get(actual)
      if (!carpeta) break
      ruta.unshift(carpeta.nombre)
      rutaIds.unshift(actual)
      actual = carpeta.padre
    }
    return { ruta, rutaIds }
  }

  const archivos: ArchivoDriveConRuta[] = []
  let tokenArchivos: string | undefined
  do {
    const { data } = await drive.files.list({
      q: `mimeType != '${CARPETA_MIME}' and trashed = false`,
      fields:
        "nextPageToken, files(id, name, mimeType, webViewLink, modifiedTime, size, parents)",
      pageSize: 1000,
      pageToken: tokenArchivos,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: "drive",
      driveId: sharedDriveId(),
    })
    for (const f of data.files ?? []) {
      const carpetaId = f.parents?.[0] ?? null
      archivos.push({
        id: f.id!,
        nombre: f.name ?? "(sin nombre)",
        mimeType: f.mimeType ?? "",
        url: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
        modificado: f.modifiedTime ?? new Date(0).toISOString(),
        tamano: f.size ? Number(f.size) : 0,
        carpetaId,
        ...rutaDe(carpetaId),
      })
    }
    tokenArchivos = data.nextPageToken ?? undefined
  } while (tokenArchivos)

  return archivos
}

// Exporta un archivo nativo de Google (Doc/Sheet/Slides) como texto plano.
export async function exportarTextoDrive(
  fileId: string,
  mimeExport: string
): Promise<string> {
  const drive = driveClient()
  const { data } = await drive.files.export(
    { fileId, mimeType: mimeExport },
    { responseType: "text" }
  )
  return typeof data === "string" ? data : String(data)
}

// Descarga el contenido binario de un archivo común (docx, pdf, txt...).
export async function descargarArchivoDrive(fileId: string): Promise<Buffer> {
  const drive = driveClient()
  const { data } = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  )
  return Buffer.from(data as ArrayBuffer)
}

// Devuelve la carpeta destino de una subida: si se indica una subcarpeta, la
// asegura (crea si no existe) dentro del padre; si no, sube al padre directo.
export async function resolverCarpetaDestino(
  padreId: string,
  subcarpeta?: string | null
): Promise<string> {
  if (!subcarpeta) return padreId
  return asegurarCarpeta(subcarpeta, padreId)
}

// Inicia una subida "resumable" contra Drive con la cuenta de servicio y
// devuelve la URL de sesión. El navegador después sube los bytes directo a esa
// URL (sin pasar por nuestro servidor, así no hay límite de tamaño de Vercel).
// La URL de sesión ya viene autorizada: no expone las credenciales.
export async function iniciarSubidaResumable(
  nombre: string,
  carpetaId: string,
  mimeType: string
): Promise<string> {
  const { token } = await clienteJwt(SCOPES).getAccessToken()
  if (!token) throw new Error("No se pudo autenticar con Drive")

  const params = new URLSearchParams({
    uploadType: "resumable",
    supportsAllDrives: "true",
    fields: "id,name,webViewLink",
  })
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType || "application/octet-stream",
      },
      body: JSON.stringify({ name: nombre, parents: [carpetaId] }),
    }
  )
  if (!res.ok) {
    throw new Error(`No se pudo iniciar la subida a Drive (${res.status})`)
  }
  const location = res.headers.get("location")
  if (!location) throw new Error("Drive no devolvió la URL de subida")
  return location
}

import { BusquedaGlobal } from "@/components/busqueda-global"
import { Encabezado } from "@/components/zq/encabezado"
import { paredEnZona } from "@/lib/disponibilidad"
import { driveConfigurado, listarArchivosConRuta } from "@/lib/drive"
import { type Documento } from "@/lib/dominio"
import { createClient } from "@/lib/supabase/server"
import { estadoIndice } from "./indice-actions"
import { IndiceBusqueda } from "./indice-busqueda"
import { ListaDocumentos, type FilaDocumento } from "./lista-documentos"

export const metadata = { title: "Documentos" }

// Además de indexar, esta pantalla recorre Drive entero (archivos + carpetas)
// para armar la lista: le damos el máximo de tiempo permitido en Vercel Hobby.
export const maxDuration = 60

export default async function DocumentosPage() {
  const supabase = await createClient()
  const [
    { data: anotaciones },
    { data: clientes },
    { data: proyectos },
    indice,
    { data: transcripciones },
    { data: decisionesData },
  ] = await Promise.all([
      supabase.from("documentos").select("*").is("deleted_at", null),
      supabase
        .from("clientes")
        .select("id, nombre, drive_folder_id")
        .is("deleted_at", null),
      supabase
        .from("proyectos")
        .select("id, nombre, cliente_id, drive_folder_id")
        .is("deleted_at", null),
      estadoIndice(),
      // Reuniones con transcripción: el archivo de Drive sabe de qué reunión es.
      supabase
        .from("solicitudes_reunion")
        .select("id, titulo, inicio, cliente_id, proyecto_id, drive_transcripcion_id")
        .not("drive_transcripcion_id", "is", null)
        .is("deleted_at", null),
      supabase.from("decisiones").select("id, titulo, fecha, cliente_id, proyecto_id").is("deleted_at", null),
    ])

  // Carpeta de Drive → cliente / proyecto. Es lo que permite decir de quién es
  // un archivo que nadie anotó: la convención de carpetas ya lo dice.
  const carpetaCliente = new Map<string, { id: string; nombre: string }>()
  for (const c of clientes ?? []) {
    if (c.drive_folder_id) {
      carpetaCliente.set(c.drive_folder_id, { id: c.id, nombre: c.nombre })
    }
  }
  const carpetaProyecto = new Map<
    string,
    { id: string; nombre: string; cliente_id: string | null }
  >()
  for (const p of proyectos ?? []) {
    if (p.drive_folder_id) {
      carpetaProyecto.set(p.drive_folder_id, {
        id: p.id,
        nombre: p.nombre,
        cliente_id: p.cliente_id,
      })
    }
  }

  const porFileId = new Map<string, Documento>()
  for (const a of (anotaciones ?? []) as Documento[]) {
    if (a.drive_file_id) porFileId.set(a.drive_file_id, a)
  }
  const nombreCliente = new Map((clientes ?? []).map((c) => [c.id, c.nombre]))
  const nombreProyecto = new Map((proyectos ?? []).map((p) => [p.id, p.nombre]))

  const archivos = driveConfigurado() ? await listarArchivosConRuta() : []

  // Vínculos de un archivo. No hay una relación guardada entre documentos y
  // decisiones: si el archivo es la transcripción de una reunión, se vincula
  // esa reunión y las decisiones de ese día para su cliente o proyecto.
  type Reunion = {
    id: string
    titulo: string
    inicio: string | null
    cliente_id: string | null
    proyecto_id: string | null
    drive_transcripcion_id: string
  }
  type DecisionCorta = { id: string; titulo: string; fecha: string; cliente_id: string | null; proyecto_id: string | null }
  const reunionPorArchivo = new Map(((transcripciones ?? []) as Reunion[]).map((r) => [r.drive_transcripcion_id, r]))
  const decisiones = (decisionesData ?? []) as DecisionCorta[]
  function vinculosDe(fileId: string): FilaDocumento["vinculos"] {
    const r = reunionPorArchivo.get(fileId)
    if (!r) return { reunion: null, decisiones: [] }
    const dia = r.inicio ? paredEnZona(Date.parse(r.inicio)).fecha : null
    return {
      reunion: { id: r.id, titulo: r.titulo },
      decisiones: decisiones
        .filter(
          (d) =>
            d.fecha === dia &&
            ((r.proyecto_id && d.proyecto_id === r.proyecto_id) || (r.cliente_id && d.cliente_id === r.cliente_id))
        )
        .map((d) => ({ id: d.id, titulo: d.titulo })),
    }
  }

  const filas: FilaDocumento[] = archivos
    .map((archivo) => {
      const anotacion = porFileId.get(archivo.id) ?? null

      // La carpeta más profunda gana: si el archivo está dentro de la carpeta
      // de un proyecto, el cliente sale del proyecto, no de la carpeta de más
      // arriba. Por eso se recorre la ruta de la raíz hacia abajo.
      let cliente: { id: string; nombre: string } | null = null
      let proyecto: { id: string; nombre: string } | null = null
      for (const carpetaId of archivo.rutaIds) {
        const c = carpetaCliente.get(carpetaId)
        if (c) cliente = c
        const p = carpetaProyecto.get(carpetaId)
        if (p) {
          proyecto = { id: p.id, nombre: p.nombre }
          if (p.cliente_id) {
            cliente = {
              id: p.cliente_id,
              nombre: nombreCliente.get(p.cliente_id) ?? "—",
            }
          }
        }
      }

      // Lo anotado a mano manda sobre lo inferido de la carpeta: si alguien
      // dijo que este contrato es de tal cliente, es de tal cliente.
      if (anotacion?.cliente_id) {
        cliente = {
          id: anotacion.cliente_id,
          nombre: nombreCliente.get(anotacion.cliente_id) ?? "—",
        }
      }
      if (anotacion?.proyecto_id) {
        proyecto = {
          id: anotacion.proyecto_id,
          nombre: nombreProyecto.get(anotacion.proyecto_id) ?? "—",
        }
      }

      return {
        vinculos: vinculosDe(archivo.id),
        fileId: archivo.id,
        nombre: anotacion?.titulo ?? archivo.nombre,
        nombreArchivo: archivo.nombre,
        url: archivo.url,
        ruta: archivo.ruta,
        modificado: archivo.modificado,
        anotacion: anotacion
          ? {
              id: anotacion.id,
              tipo: anotacion.tipo,
              tags: anotacion.tags,
              fecha: anotacion.fecha,
            }
          : null,
        cliente,
        proyecto,
      }
    })
    .sort((a, b) => b.modificado.localeCompare(a.modificado))

  // Anotaciones cuyo archivo ya no está en Drive (o que quedaron sin file id
  // en el backfill): no se pierden, se muestran aparte para poder arreglarlas.
  const huerfanas = ((anotaciones ?? []) as Documento[]).filter(
    (a) => !a.drive_file_id || !archivos.some((f) => f.id === a.drive_file_id)
  )

  return (
    <>
      <Encabezado titulo="Documentos" />

      <div className="flex flex-col items-center gap-2">
        <BusquedaGlobal
          placeholder="Buscá por nombre o por significado"
          className="h-14 w-full max-w-[640px] rounded-full bg-card px-6 text-base"
        />
        <IndiceBusqueda estado={indice} totalArchivos={filas.length} />
      </div>

      {!driveConfigurado() || filas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-input p-8 text-center text-muted-foreground">
          <p className="m-0 font-semibold text-foreground">Sin archivos</p>
          <p className="m-0 mt-1">Acá se ve todo lo que hay en la unidad compartida de Drive, ordenado por cliente.</p>
        </div>
      ) : (
        <ListaDocumentos
          filas={filas}
          clientes={(clientes ?? []).map((c) => ({ id: c.id, nombre: c.nombre }))}
          proyectos={(proyectos ?? []).map((p) => ({
            id: p.id,
            nombre: p.nombre,
            cliente_id: p.cliente_id,
          }))}
          huerfanas={huerfanas.map((a) => ({
            id: a.id,
            titulo: a.titulo,
            drive_url: a.drive_url,
          }))}
        />
      )}
    </>
  )
}

import { cn } from "@/lib/utils"

// Etiqueta de color por tipo de archivo (guía del rediseño, Documentos). Es
// una de las dos excepciones a "no hardcodear colores": cada tipo tiene el
// suyo, igual en los dos temas.
const TIPOS: { tipo: string; color: string; ext: RegExp }[] = [
  { tipo: "DOC", color: "#4a7bd0", ext: /\.(docx?|odt|rtf)$/i },
  { tipo: "XLS", color: "#2f8f5b", ext: /\.(xlsx?|csv|ods)$/i },
  { tipo: "PDF", color: "#c94a3d", ext: /\.pdf$/i },
  { tipo: "PPT", color: "#d9822b", ext: /\.(pptx?|key|odp)$/i },
  { tipo: "PNG", color: "#7a5ab8", ext: /\.(png|jpe?g|gif|webp|svg|heic)$/i },
  { tipo: "MP4", color: "#1e272c", ext: /\.(mp4|mov|webm|m4a|mp3|wav)$/i },
]

// Sin extensión, un archivo de Drive suele ser un Google Doc.
export function tipoArchivo(nombre: string): { tipo: string; color: string } {
  const t = TIPOS.find((x) => x.ext.test(nombre))
  if (t) return t
  if (!/\.[a-z0-9]{2,5}$/i.test(nombre)) return TIPOS[0]
  return { tipo: "TXT", color: "#6b7175" }
}

export function EtiquetaArchivo({ nombre, className }: { nombre: string; className?: string }) {
  const { tipo, color } = tipoArchivo(nombre)
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: color }}
      className={cn(
        "inline-flex h-[18px] w-[34px] shrink-0 items-center justify-center rounded text-[10px] font-bold text-white",
        className
      )}
    >
      {tipo}
    </span>
  )
}

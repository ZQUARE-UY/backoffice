import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"

// Render de los campos del one-pager: la entrevista escribe Markdown
// (bullets, negritas en números clave, tablas si hacen falta) y acá se
// respeta. Mapa de componentes propio en lugar del plugin typography:
// controla exactamente la escala tipográfica del documento.
export function MarkdownIdea({
  children,
  lead = false,
}: {
  children: string
  lead?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 leading-relaxed",
        lead ? "text-base" : "text-sm"
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (props) => <p className="whitespace-pre-wrap" {...props} />,
          strong: (props) => (
            <strong className="font-semibold" {...props} />
          ),
          a: (props) => (
            <a
              className="text-primary underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
              {...props}
            />
          ),
          ul: (props) => (
            <ul className="flex list-disc flex-col gap-1.5 pl-5" {...props} />
          ),
          ol: (props) => (
            <ol
              className="flex list-decimal flex-col gap-1.5 pl-5"
              {...props}
            />
          ),
          li: (props) => <li className="pl-1" {...props} />,
          // Cualquier nivel de título dentro de un campo se normaliza a un
          // subtítulo discreto: la jerarquía grande la ponen las secciones.
          h1: (props) => <h4 className="font-semibold" {...props} />,
          h2: (props) => <h4 className="font-semibold" {...props} />,
          h3: (props) => <h4 className="font-semibold" {...props} />,
          h4: (props) => <h4 className="font-semibold" {...props} />,
          blockquote: (props) => (
            <blockquote
              className="border-l-2 pl-3 text-muted-foreground italic"
              {...props}
            />
          ),
          code: (props) => (
            <code
              className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
              {...props}
            />
          ),
          table: (props) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm" {...props} />
            </div>
          ),
          th: (props) => (
            <th
              className="border-b py-1.5 pr-4 text-left font-medium"
              {...props}
            />
          ),
          td: (props) => (
            <td className="border-b border-border/50 py-1.5 pr-4" {...props} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

// Versión sin formato para previews de una línea (tarjetas del listado):
// saca la sintaxis de Markdown en lugar de mostrarla cruda.
export function textoPlano(markdown: string): string {
  return markdown
    .replace(/[#*_`>]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
}

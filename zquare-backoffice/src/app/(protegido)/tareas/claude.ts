import { codigoTarea, type Tarea } from "@/lib/dominio"

// "Desarrollar" abre claude.ai con el prompt precargado (?q=), igual que los
// atajos de ideas: la conversación usa el conector MCP del backoffice que
// cada socio ya tiene, y el prompt solo dice qué tarjeta traer y qué hacer.
export function urlDesarrollarTarea(tarea: Pick<Tarea, "numero" | "titulo">): string {
  const codigo = codigoTarea(tarea.numero)
  const prompt = `Desarrollá la tarjeta ${codigo} ("${tarea.titulo}") del tablero del backoffice ZQUARE: traé su ficha con ficha_tarea, completá el brief entrevistándome como en el prompt desarrollar_tarea y guardalo con actualizar_tarea.`
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`
}

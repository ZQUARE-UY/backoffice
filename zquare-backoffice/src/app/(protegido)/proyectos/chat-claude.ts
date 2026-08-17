import { BRIEF_PROYECTO, type CampoBriefProyecto } from "@/lib/dominio"

// Atajos "trabajarlo con Claude": abren claude.ai con el prompt precargado
// (parámetro ?q=), igual que en el banco de ideas. La conversación usa el
// conector MCP del backoffice que cada socio ya tiene configurado — el prompt
// solo tiene que decirle qué proyecto traer y qué hacer con él.
//
// El ida y vuelta del arranque vive en Claude a propósito: la entrevista
// necesita leer documentos, repreguntar y cambiar de rumbo, y eso es una
// conversación, no un formulario. El backoffice guarda el resultado y muestra
// qué falta.

function urlChat(prompt: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`
}

export function urlComenzarProyecto(nombre: string): string {
  return urlChat(
    `Arranquemos el proyecto "${nombre}" de ZQUARE con el proceso estándar: usá el prompt comenzar_proyecto del conector del backoffice. Leé primero su ficha con ficha_proyecto y los documentos con buscar, y preguntame solo lo que no esté ahí.`
  )
}

export function urlIterarBrief(
  nombre: string,
  campo: CampoBriefProyecto
): string {
  const seccion = BRIEF_PROYECTO[campo].label
  return urlChat(
    `Traé la ficha del proyecto "${nombre}" del backoffice ZQUARE con ficha_proyecto y trabajemos a fondo la sección "${seccion}" de su brief de arranque: cuestioná lo que hay, buscá contexto en sus documentos y guardá el avance con actualizar_proyecto.`
  )
}

import { BRIEF_PROYECTO, type CampoBriefProyecto } from "@/lib/dominio"

// Los prompts de arranque, como texto para copiar al portapapeles. No abrimos
// claude.ai con `?q=`: la conversación puede querer arrancarse en la app de
// escritorio, en un proyecto de Claude con más contexto o en Claude Code, y
// esa elección es de quien arranca, no nuestra. El backoffice pone el texto
// en el portapapeles y se corre.
//
// El ida y vuelta del arranque vive en Claude a propósito: la entrevista
// necesita leer documentos, repreguntar y cambiar de rumbo, y eso es una
// conversación, no un formulario. El backoffice guarda el resultado y muestra
// qué falta.

export function promptComenzarProyecto(nombre: string): string {
  return `Arranquemos el proyecto "${nombre}" de ZQUARE con el proceso estándar: usá el prompt comenzar_proyecto del conector del backoffice. Leé primero su ficha con ficha_proyecto y los documentos con buscar, y preguntame solo lo que no esté ahí.`
}

export function promptIterarBrief(
  nombre: string,
  campo: CampoBriefProyecto
): string {
  const seccion = BRIEF_PROYECTO[campo].label
  return `Traé la ficha del proyecto "${nombre}" del backoffice ZQUARE con ficha_proyecto y trabajemos a fondo la sección "${seccion}" de su brief de arranque: cuestioná lo que hay, buscá contexto en sus documentos y guardá el avance con actualizar_proyecto.`
}

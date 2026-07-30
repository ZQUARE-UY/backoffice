import {
  codigoIdea,
  ONE_PAGER_IDEA,
  type CampoOnePager,
  type Idea,
} from "@/lib/dominio"

// Atajos "iterar con Claude": abren claude.ai con el prompt precargado
// (parámetro ?q=). La conversación resultante usa el conector MCP del
// backoffice que cada socio ya tiene configurado en su cuenta — el prompt
// solo tiene que decirle a Claude qué idea traer y qué hacer con ella.

function urlChat(prompt: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`
}

export function urlIterarIdea(idea: Pick<Idea, "numero" | "titulo">): string {
  const codigo = codigoIdea(idea.numero)
  return urlChat(
    `Retomá la idea ${codigo} ("${idea.titulo}") del banco de ideas del backoffice ZQUARE: traé su ficha con ficha_idea y seguí bajándola a tierra con la entrevista de bajar_idea_a_tierra, guardando los avances con actualizar_idea.`
  )
}

export function urlIterarSeccion(
  idea: Pick<Idea, "numero" | "titulo">,
  campo: CampoOnePager
): string {
  const codigo = codigoIdea(idea.numero)
  const seccion = ONE_PAGER_IDEA[campo].label
  return urlChat(
    `Traé la ficha de la idea ${codigo} ("${idea.titulo}") del backoffice ZQUARE con ficha_idea y trabajemos a fondo la sección "${seccion}" de su one-pager: cuestioná lo que hay, investigá lo que haga falta y guardá el avance con actualizar_idea.`
  )
}

import { type Tarea } from "@/lib/dominio"

// `orden` es numeric justamente para esto: al soltar entre dos tarjetas se
// guarda el punto medio de sus `orden` y solo se escribe la fila movida.
// Lo usan el tablero (columnas) y el backlog (lista priorizada).
export function ordenEntre(anterior: Tarea | undefined, siguiente: Tarea | undefined) {
  if (anterior && siguiente) return (Number(anterior.orden) + Number(siguiente.orden)) / 2
  if (anterior) return Number(anterior.orden) + 1
  if (siguiente) return Number(siguiente.orden) - 1
  return 0
}

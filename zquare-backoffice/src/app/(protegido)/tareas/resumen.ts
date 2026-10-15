import { type Tarea } from "@/lib/dominio"

// Métricas de un sprint a partir de sus tarjetas. Sin "use client": lo usan
// el backlog (en el navegador) y la página del tablero (en el server).
export type ResumenSprint = {
  total: number
  hechas: number
  puntos: number
  puntos_hechos: number
}

export function resumirSprint(tarjetas: Pick<Tarea, "estado" | "estimacion">[]): ResumenSprint {
  return tarjetas.reduce<ResumenSprint>(
    (r, t) => ({
      total: r.total + 1,
      hechas: r.hechas + (t.estado === "hecho" ? 1 : 0),
      puntos: r.puntos + (t.estimacion ?? 0),
      puntos_hechos: r.puntos_hechos + (t.estado === "hecho" ? (t.estimacion ?? 0) : 0),
    }),
    { total: 0, hechas: 0, puntos: 0, puntos_hechos: 0 }
  )
}

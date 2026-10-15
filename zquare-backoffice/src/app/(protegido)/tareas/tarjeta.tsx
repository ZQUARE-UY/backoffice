import { codigoSprint, codigoTarea, type EstadoTarea, type Sprint, type Tarea } from "@/lib/dominio"
import { diasHasta, fechaCorta, iniciales, tonoVencimiento, vencimiento } from "@/lib/formato"
import { cn } from "@/lib/utils"

// Piezas visuales del tablero y la ficha de tarea (rediseño, Paso 2).

// Color del punto de cada columna.
export const COLOR_COLUMNA: Record<EstadoTarea, string> = {
  backlog: "bg-muted-foreground/40",
  por_hacer: "bg-input",
  en_curso: "bg-lima",
  en_revision: "bg-aviso",
  hecho: "bg-positivo",
}

export function PuntoColumna({ estado, className }: { estado: EstadoTarea; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-full", COLOR_COLUMNA[estado], className)}
    />
  )
}

// Avatar del responsable: iniciales sobre lima, o una circunferencia
// punteada si no tiene.
export function AvatarSocio({
  nombre,
  className,
}: {
  nombre?: string | null
  className?: string
}) {
  if (!nombre) {
    return (
      <span
        title="Sin responsable"
        className={cn(
          "inline-block size-6 shrink-0 rounded-full border border-dashed border-input",
          className
        )}
      />
    )
  }
  return (
    <span
      title={nombre}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-lima text-[10px] font-bold text-carbon",
        className
      )}
    >
      {iniciales(nombre)}
    </span>
  )
}

// Los nombres de sprint vienen corridos en la base ("Sprint 5 — …" en el
// sprint 7): en la UI manda el número, así que se le saca el prefijo.
export function nombreSinNumero(sprint: Pick<Sprint, "nombre" | "numero">): string {
  const limpio = sprint.nombre.replace(/^\s*sprint\s*\d+\s*[—–\-:·]?\s*/i, "").trim()
  return limpio || codigoSprint(sprint.numero)
}

// Prioridad visible en la tarjeta: solo Alta y Urgente, en aviso.
export function prioridadDestacada(tarea: Pick<Tarea, "prioridad">): string | null {
  if (tarea.prioridad === "urgente") return "Urgente"
  if (tarea.prioridad === "alta") return "Alta"
  return null
}

const TONO_TEXTO = { negativo: "text-negativo", aviso: "text-aviso" } as const

// Fecha límite con su tono: negativo si venció, aviso si faltan 7 días o
// menos. Una tarjeta hecha ya no vence.
export function FechaLimite({
  tarea,
  corta = true,
  className,
}: {
  tarea: Pick<Tarea, "fecha_limite" | "estado">
  corta?: boolean
  className?: string
}) {
  if (!tarea.fecha_limite) return null
  const tono = tarea.estado === "hecho" ? null : tonoVencimiento(tarea.fecha_limite)
  // En la tarjeta va corta ("24 set.", "Mañana"); en la ficha, completa
  // ("18 oct. · en 4 días", "Venció hace 15 días").
  const n = diasHasta(tarea.fecha_limite)
  const texto = !corta
    ? vencimiento(tarea.fecha_limite)
    : n === 0
      ? "Hoy"
      : n === 1
        ? "Mañana"
        : fechaCorta(tarea.fecha_limite)
  return (
    <span
      className={cn(
        "zq-num font-semibold",
        tono ? TONO_TEXTO[tono] : "text-muted-foreground",
        className
      )}
    >
      {texto}
    </span>
  )
}

// Tarjeta del tablero: "Cliente · ZQ-NNN", el título y, abajo, el avatar del
// responsable con la prioridad (si es Alta o Urgente) y la fecha límite.
export function TarjetaTarea({
  tarea,
  cliente,
  responsable,
  className,
}: {
  tarea: Tarea
  cliente?: string | null
  responsable?: string | null
  className?: string
}) {
  const prioridad = prioridadDestacada(tarea)
  return (
    <span
      className={cn(
        "flex flex-col gap-1.5 rounded-[10px] border bg-card px-3.5 py-3 text-left text-card-foreground transition-colors hover:border-input",
        className
      )}
    >
      <span className="text-xs leading-4 text-muted-foreground">
        {cliente ?? "Interna"} · {codigoTarea(tarea.numero)}
      </span>
      <span className="font-medium">{tarea.titulo}</span>
      <span className="mt-1.5 flex items-center justify-between gap-2 text-xs leading-4">
        <AvatarSocio nombre={responsable} />
        <span className="flex items-center gap-2">
          {prioridad && <span className="font-semibold text-aviso">{prioridad}</span>}
          <FechaLimite tarea={tarea} />
        </span>
      </span>
    </span>
  )
}

import Link from "next/link"
import { ArrowRightIcon, KanbanIcon } from "lucide-react"

import { EstadoTareaBadge } from "@/components/estado-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  codigoTarea,
  PRIORIDADES_TAREA,
  type EstadoTarea,
  type PrioridadTarea,
} from "@/lib/dominio"

export type TareaRelacionada = {
  id: string
  numero: number
  titulo: string
  estado: EstadoTarea
  prioridad: PrioridadTarea
  fecha_limite: string | null
}

// Sección "Tareas" de las fichas de cliente y proyecto: las abiertas, con
// entrada al tablero ya filtrado (`hrefTablero` trae los searchParams).
export function TareasRelacionadas({
  tareas,
  hrefTablero,
}: {
  tareas: TareaRelacionada[]
  hrefTablero: string
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Tareas</h2>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={hrefTablero} />}
        >
          Ver en tablero
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </div>

      {tareas.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <KanbanIcon />
            </EmptyMedia>
            <EmptyTitle>Sin tareas abiertas</EmptyTitle>
            <EmptyDescription>
              Las tareas se crean desde el tablero.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Código</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Fecha límite</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tareas.map((tarea) => (
                <TableRow key={tarea.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {codigoTarea(tarea.numero)}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`${hrefTablero}&tarea=${codigoTarea(tarea.numero)}`}
                      className="hover:underline"
                    >
                      {tarea.titulo}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <EstadoTareaBadge estado={tarea.estado} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={PRIORIDADES_TAREA[tarea.prioridad].variant}>
                      {PRIORIDADES_TAREA[tarea.prioridad].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {tarea.fecha_limite ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}

import { RepeatIcon, WalletIcon } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import {
  Empty,
  EmptyContent,
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
import { Encabezado } from "@/components/zq/encabezado"
import {
  ESTADOS_MOVIMIENTO,
  formatearMonto,
  formatearUsd,
  TIPOS_MOVIMIENTO,
  type MovimientoParticipacion,
} from "@/lib/dominio"

import { cargarFinanzas } from "../datos"
import { MovimientoAcciones } from "../movimiento-acciones"
import { NuevoMovimiento } from "../nuevo-movimiento"

export const metadata = { title: "Movimientos" }

const usd = formatearUsd

// Todos los movimientos ("Ver todos" de Finanzas), con editar y eliminar.
export default async function MovimientosPage() {
  const { movimientos, socios, clientes, proyectos, participaciones, recurrentes } = await cargarFinanzas()
  const nombreSocio = new Map(socios.map((s) => [s.id, s.nombre]))
  const recurrentePorId = new Map(recurrentes.map((r) => [r.id, r]))
  const nombreProyecto = new Map(proyectos.map((p) => [p.id, p.nombre]))

  // Participaciones agrupadas por movimiento, para el formulario de edición.
  const repartoPorMovimiento = new Map<string, MovimientoParticipacion[]>()
  for (const p of participaciones) {
    const filas = repartoPorMovimiento.get(p.movimiento_id) ?? []
    filas.push(p)
    repartoPorMovimiento.set(p.movimiento_id, filas)
  }

  return (
    <>
      <Encabezado
        titulo="Movimientos"
        rotulo="Finanzas"
        volverA={{ href: "/finanzas", label: "Volver a Finanzas" }}
        acciones={<NuevoMovimiento socios={socios} clientes={clientes} proyectos={proyectos} escucharCrear />}
      />

      {movimientos.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WalletIcon />
            </EmptyMedia>
            <EmptyTitle>Sin movimientos</EmptyTitle>
            <EmptyDescription>
              Cargá el primer ingreso o gasto para empezar a llevar las finanzas
              de la empresa.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <NuevoMovimiento
              socios={socios}
              clientes={clientes}
              proyectos={proyectos}
            />
          </EmptyContent>
        </Empty>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead>Puso / cobró</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">USD</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimientos.map((m) => {
                const tipo = TIPOS_MOVIMIENTO[m.tipo]
                return (
                  <TableRow
                    key={m.id}
                    className={m.estado === "previsto" ? "opacity-60" : ""}
                  >
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {m.fecha}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={tipo.variant}>{tipo.label}</Badge>
                        {m.recurrente_id && (
                          <RepeatIcon
                            aria-label="Generado por un recurrente"
                            className="size-3.5 text-muted-foreground"
                          />
                        )}
                        {m.estado === "previsto" && (
                          <Badge variant={ESTADOS_MOVIMIENTO.previsto.variant}>
                            {ESTADOS_MOVIMIENTO.previsto.label}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{m.descripcion ?? m.categoria ?? "—"}</span>
                        {(m.proyecto_id || (m.descripcion && m.categoria)) && (
                          <span className="text-xs text-muted-foreground">
                            {[
                              m.descripcion && m.categoria ? m.categoria : null,
                              m.proyecto_id
                                ? nombreProyecto.get(m.proyecto_id)
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.socio_id
                        ? nombreSocio.get(m.socio_id) ?? "—"
                        : "Fondo común"}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {m.comprobante_url ? (
                        <Link
                          href={m.comprobante_url}
                          target="_blank"
                          className="text-primary hover:underline"
                        >
                          {formatearMonto(m.monto, m.moneda)}
                        </Link>
                      ) : (
                        formatearMonto(m.monto, m.moneda)
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums text-muted-foreground">
                      {usd(m.monto_usd)}
                    </TableCell>
                    <TableCell>
                      <MovimientoAcciones
                        movimiento={m}
                        recurrente={
                          m.recurrente_id
                            ? recurrentePorId.get(m.recurrente_id)
                            : undefined
                        }
                        socios={socios}
                        clientes={clientes}
                        proyectos={proyectos}
                        reparto={repartoPorMovimiento.get(m.id) ?? []}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatearUsd, type BalanceSocio } from "@/lib/dominio"

// Balance entre socios: aporte neto de cada uno (aportes menos retiros) y su
// diferencia contra el promedio. Un valor negativo indica cuánto le falta
// poner para emparejar. Compartido entre Finanzas y el Dashboard.
export function BalanceSociosTabla({ balance }: { balance: BalanceSocio[] }) {
  if (balance.length === 0) return null

  const total = balance.reduce((acc, b) => acc + b.aporte_neto_usd, 0)
  const promedio = total / balance.length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Balance de socios</CardTitle>
        <CardDescription>
          Aporte neto de cada socio y su diferencia contra el promedio. Un valor
          negativo indica cuánto le falta poner para emparejar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Socio</TableHead>
              <TableHead className="text-right">Aporte neto</TableHead>
              <TableHead className="text-right">vs. promedio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {balance.map((b) => {
              const diff = b.aporte_neto_usd - promedio
              return (
                <TableRow key={b.socio_id}>
                  <TableCell className="font-medium">{b.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatearUsd(b.aporte_neto_usd)}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${
                      diff < -0.005
                        ? "text-destructive"
                        : diff > 0.005
                          ? "text-emerald-600 dark:text-emerald-500"
                          : "text-muted-foreground"
                    }`}
                  >
                    {diff > 0.005 ? "+" : ""}
                    {formatearUsd(diff)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

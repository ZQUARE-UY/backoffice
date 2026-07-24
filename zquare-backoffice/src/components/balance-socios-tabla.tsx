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

// Balance entre socios (Splitwise): cuánto puso de su bolsillo cada uno y su
// saldo respecto a lo que le corresponde. Saldo positivo = los demás le deben;
// negativo = debe. Compartido entre Finanzas y el Dashboard.
export function BalanceSociosTabla({ balance }: { balance: BalanceSocio[] }) {
  if (balance.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Balance de socios</CardTitle>
        <CardDescription>
          Cuánto puso cada socio de su bolsillo y su saldo. Un saldo a favor
          (verde) significa que los demás le deben; en contra (rojo), que debe.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Socio</TableHead>
              <TableHead className="text-right">Puso</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {balance.map((b) => (
              <TableRow key={b.socio_id}>
                <TableCell className="font-medium">{b.nombre}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatearUsd(b.pagado_usd)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${
                    b.saldo_usd < -0.005
                      ? "text-destructive"
                      : b.saldo_usd > 0.005
                        ? "text-emerald-600 dark:text-emerald-500"
                        : "text-muted-foreground"
                  }`}
                >
                  {b.saldo_usd > 0.005 ? "+" : ""}
                  {formatearUsd(b.saldo_usd)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

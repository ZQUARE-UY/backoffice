import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function AccesoDenegadoPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Acceso denegado</CardTitle>
          <CardDescription>
            Este backoffice es exclusivo para los socios de ZQUARE. Tu cuenta
            no está autorizada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            Volver al inicio de sesión
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}

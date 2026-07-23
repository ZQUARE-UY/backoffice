import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { BotonGoogle } from "./boton-google"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl tracking-tight">ZQUARE</CardTitle>
          <CardDescription>
            Backoffice de gestión. Acceso exclusivo para socios.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <BotonGoogle />
          {error && (
            <p className="text-center text-sm text-destructive">
              Hubo un problema al iniciar sesión. Probá de nuevo.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

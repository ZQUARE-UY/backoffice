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
  searchParams: Promise<{ error?: string; detalle?: string }>
}) {
  const { error, detalle } = await searchParams

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
            <div className="flex flex-col gap-1 text-center">
              <p className="text-sm text-destructive">
                Hubo un problema al iniciar sesión. Probá de nuevo.
              </p>
              {detalle && (
                <p className="text-xs text-muted-foreground break-words">
                  {detalle}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

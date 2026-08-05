"use client"

import { useState, useTransition } from "react"
import { CalendarCheckIcon } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

import { agendarReunion } from "../actions"

export type HuecoVista = {
  inicioIso: string
  dia: string
  hora: string
  rango: string
}

// Los huecos que sobrevivieron a todos los filtros: son horarios donde todos
// los que respondieron dijeron que podían y ninguno tiene nada agendado.
export function Huecos({
  solicitudId,
  huecos,
  parcial,
  faltan,
  invitados,
}: {
  solicitudId: string
  huecos: HuecoVista[]
  parcial: boolean
  faltan: string[]
  invitados: string[]
}) {
  const [elegido, setElegido] = useState<HuecoVista | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  function confirmar() {
    if (!elegido) return
    iniciarTransicion(async () => {
      const resultado = await agendarReunion(solicitudId, elegido.inicioIso)
      setElegido(null)
      if (!resultado.ok) {
        toast.error(resultado.error ?? "No se pudo agendar")
      } else if (resultado.advertencia) {
        toast.warning(resultado.advertencia)
      } else {
        toast.success("Reunión agendada e invitaciones enviadas")
      }
    })
  }

  // Agrupado por día, respetando el orden cronológico que ya trae la lista.
  const porDia: { dia: string; huecos: HuecoVista[] }[] = []
  for (const hueco of huecos) {
    const ultimo = porDia[porDia.length - 1]
    if (ultimo && ultimo.dia === hueco.dia) ultimo.huecos.push(hueco)
    else porDia.push({ dia: hueco.dia, huecos: [hueco] })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Huecos en común</CardTitle>
        {parcial && faltan.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Todavía falta responder {faltan.join(", ")}: estos huecos pueden
            achicarse.
          </p>
        )}
      </CardHeader>
      <CardContent>
        {huecos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {parcial
              ? "Por ahora no hay ningún horario que les sirva a todos los que respondieron."
              : "No quedó ningún horario en común. Habría que ampliar los días o achicar la reunión."}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {porDia.map((grupo) => (
              <div key={grupo.dia} className="flex flex-col gap-2">
                <span className="text-sm font-medium capitalize">
                  {grupo.dia}
                </span>
                <div className="flex flex-wrap gap-2">
                  {grupo.huecos.map((hueco) => (
                    <Button
                      key={hueco.inicioIso}
                      variant="outline"
                      size="sm"
                      onClick={() => setElegido(hueco)}
                    >
                      {hueco.hora}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog
        open={elegido !== null}
        onOpenChange={(abierto) => !abierto && setElegido(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <CalendarCheckIcon data-icon="inline-start" />
              Agendar {elegido?.rango}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se crea el evento en Google Calendar con link de Meet y se manda
              la invitación a {invitados.join(", ")}.
              {parcial && faltan.length > 0
                ? ` Ojo que ${faltan.join(", ")} todavía no respondió.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendiente}
              onClick={(e) => {
                e.preventDefault()
                confirmar()
              }}
            >
              {pendiente && <Spinner data-icon="inline-start" />}
              Agendar e invitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

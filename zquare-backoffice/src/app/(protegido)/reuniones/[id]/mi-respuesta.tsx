"use client"

import { useState, useTransition } from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { diasDeVentana } from "@/lib/disponibilidad"

import { borrarRespuesta, guardarRespuesta, marcarNoPuedo } from "../actions"

type Rango = { desde: string; hasta: string }

// Atajos: la mayoría de las respuestas caen en uno de estos dos bloques.
const PRESETS: { label: string; rango: Rango }[] = [
  { label: "Mañana", rango: { desde: "09:00", hasta: "13:00" } },
  { label: "Tarde", rango: { desde: "14:00", hasta: "18:00" } },
]

function etiquetaFecha(fecha: string): string {
  // Mediodía UTC para que el día no se corra al formatear.
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}

// Cada socio pinta acá los ratos en que le sirve reunirse. No es su agenda:
// lo que ya tiene ocupado en Google Calendar se descuenta solo, así que lo
// que se marca es la disposición ("de tarde sí, de mañana no").
export function MiRespuesta({
  solicitudId,
  ventanaDesde,
  ventanaHasta,
  inicial,
  yaRespondi,
  noPuedo,
}: {
  solicitudId: string
  ventanaDesde: string
  ventanaHasta: string
  // Franjas ya guardadas, como hora de pared por día.
  inicial: Record<string, Rango[]>
  yaRespondi: boolean
  noPuedo: boolean
}) {
  const dias = diasDeVentana(ventanaDesde, ventanaHasta)
  const [porDia, setPorDia] = useState<Record<string, Rango[]>>(inicial)
  const [pendiente, iniciarTransicion] = useTransition()

  function agregar(fecha: string, rango: Rango) {
    setPorDia((previo) => ({
      ...previo,
      [fecha]: [...(previo[fecha] ?? []), rango],
    }))
  }

  function quitar(fecha: string, indice: number) {
    setPorDia((previo) => ({
      ...previo,
      [fecha]: (previo[fecha] ?? []).filter((_, i) => i !== indice),
    }))
  }

  function editar(
    fecha: string,
    indice: number,
    campo: keyof Rango,
    valor: string
  ) {
    setPorDia((previo) => ({
      ...previo,
      [fecha]: (previo[fecha] ?? []).map((r, i) =>
        i === indice ? { ...r, [campo]: valor } : r
      ),
    }))
  }

  function copiarDiaAnterior(fecha: string) {
    const indice = dias.indexOf(fecha)
    const anterior = dias[indice - 1]
    if (!anterior) return
    setPorDia((previo) => ({
      ...previo,
      [fecha]: [...(previo[anterior] ?? [])],
    }))
  }

  const franjas = dias.flatMap((fecha) =>
    (porDia[fecha] ?? [])
      .filter((r) => r.desde && r.hasta)
      .map((r) => ({ fecha, desde: r.desde, hasta: r.hasta }))
  )
  const invalidas = franjas.filter((f) => f.hasta <= f.desde)
  const horas = franjas.filter((f) => f.hasta > f.desde).reduce((total, f) => {
    const [hd, md] = f.desde.split(":").map(Number)
    const [hh, mh] = f.hasta.split(":").map(Number)
    return total + (hh * 60 + mh - (hd * 60 + md)) / 60
  }, 0)

  function ejecutar(
    accion: () => Promise<{ ok: boolean; error?: string }>,
    exito: string
  ) {
    iniciarTransicion(async () => {
      const resultado = await accion()
      if (resultado.ok) toast.success(exito)
      else toast.error(resultado.error ?? "No se pudo guardar")
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {yaRespondi ? "Tu disponibilidad" : "¿Cuándo podés?"}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Marcá los ratos en que te sirve reunirte. Lo que ya tenés ocupado en
          tu Google Calendar se descuenta solo.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {noPuedo && (
          <p className="text-sm text-muted-foreground">
            Respondiste que no podés en ninguno de estos días. Podés cargar
            franjas igual si te liberaste.
          </p>
        )}

        <div className="flex flex-col divide-y">
          {dias.map((fecha, indice) => {
            const rangos = porDia[fecha] ?? []
            return (
              <div
                key={fecha}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4"
              >
                <span className="w-48 shrink-0 text-sm font-medium capitalize">
                  {etiquetaFecha(fecha)}
                </span>

                <div className="flex flex-1 flex-col gap-2">
                  {rangos.map((rango, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="time"
                        step="900"
                        value={rango.desde}
                        onChange={(e) =>
                          editar(fecha, i, "desde", e.target.value)
                        }
                        className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                      />
                      <span className="text-sm text-muted-foreground">a</span>
                      <input
                        type="time"
                        step="900"
                        value={rango.hasta}
                        onChange={(e) =>
                          editar(fecha, i, "hasta", e.target.value)
                        }
                        className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                      />
                      {rango.hasta <= rango.desde && (
                        <span className="text-xs text-destructive">
                          termina antes de empezar
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => quitar(fecha, i)}
                        aria-label="Quitar franja"
                      >
                        <XIcon />
                      </Button>
                    </div>
                  ))}

                  <div className="flex flex-wrap items-center gap-1">
                    {PRESETS.map((preset) => (
                      <Button
                        key={preset.label}
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => agregar(fecha, preset.rango)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        agregar(fecha, { desde: "09:00", hasta: "18:00" })
                      }
                    >
                      <PlusIcon data-icon="inline-start" />
                      Otro rango
                    </Button>
                    {indice > 0 && (porDia[dias[indice - 1]] ?? []).length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => copiarDiaAnterior(fecha)}
                      >
                        Copiar día anterior
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={pendiente || invalidas.length > 0}
            onClick={() =>
              ejecutar(
                () => guardarRespuesta(solicitudId, franjas),
                "Guardamos tu disponibilidad"
              )
            }
          >
            {pendiente && <Spinner data-icon="inline-start" />}
            Guardar mi disponibilidad
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={pendiente}
            onClick={() => {
              setPorDia({})
              ejecutar(
                () => marcarNoPuedo(solicitudId),
                "Avisamos que no podés en estos días"
              )
            }}
          >
            No puedo ninguno de estos días
          </Button>

          {yaRespondi && (
            <Button
              type="button"
              variant="ghost"
              disabled={pendiente}
              onClick={() => {
                setPorDia({})
                ejecutar(
                  () => borrarRespuesta(solicitudId),
                  "Borramos tu respuesta"
                )
              }}
            >
              Borrar mi respuesta
            </Button>
          )}

          {horas > 0 && (
            <span className="text-sm text-muted-foreground">
              {horas.toLocaleString("es-UY", { maximumFractionDigits: 1 })} h
              marcadas
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

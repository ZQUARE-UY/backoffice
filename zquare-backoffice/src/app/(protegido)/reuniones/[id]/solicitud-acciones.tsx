"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { RotateCcwIcon, XCircleIcon } from "lucide-react"
import { toast } from "sonner"

import { BotonEliminar } from "@/components/boton-eliminar"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { EstadoReunion } from "@/lib/dominio"

import {
  cancelarReunion,
  eliminarSolicitud,
  reabrirSolicitud,
} from "../actions"

export function SolicitudAcciones({
  solicitudId,
  estado,
  tieneEvento,
}: {
  solicitudId: string
  estado: EstadoReunion
  tieneEvento: boolean
}) {
  const router = useRouter()
  const [pendiente, iniciarTransicion] = useTransition()

  function ejecutar(
    accion: () => Promise<{
      ok: boolean
      error?: string
      advertencia?: string
    }>,
    exito: string
  ) {
    iniciarTransicion(async () => {
      const resultado = await accion()
      if (!resultado.ok) {
        toast.error(resultado.error ?? "No se pudo completar")
      } else if (resultado.advertencia) {
        // El cambio se hizo pero el evento de Google quedó colgado: no decir
        // "borrado" cuando no lo está.
        toast.warning(resultado.advertencia)
      } else {
        toast.success(exito)
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {estado === "agendada" && (
        <Button
          variant="outline"
          size="sm"
          disabled={pendiente}
          onClick={() =>
            ejecutar(
              () => reabrirSolicitud(solicitudId),
              tieneEvento
                ? "Volvimos a abrir la encuesta y borramos el evento"
                : "Volvimos a abrir la encuesta"
            )
          }
        >
          {pendiente ? <Spinner data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}
          Elegir otro horario
        </Button>
      )}

      {estado !== "cancelada" && (
        <Button
          variant="outline"
          size="sm"
          disabled={pendiente}
          onClick={() =>
            ejecutar(
              () => cancelarReunion(solicitudId),
              tieneEvento
                ? "Reunión cancelada y evento borrado del calendario"
                : "Reunión cancelada"
            )
          }
        >
          <XCircleIcon data-icon="inline-start" />
          Cancelar reunión
        </Button>
      )}

      {estado === "cancelada" && (
        <Button
          variant="outline"
          size="sm"
          disabled={pendiente}
          onClick={() =>
            ejecutar(
              () => reabrirSolicitud(solicitudId),
              "Reunión reabierta"
            )
          }
        >
          <RotateCcwIcon data-icon="inline-start" />
          Reabrir
        </Button>
      )}

      <BotonEliminar
        titulo="¿Eliminar esta reunión?"
        descripcion="Se borra del backoffice junto con las respuestas de los socios, y si ya estaba agendada también se borra el evento de Google Calendar."
        accion={async () => {
          await eliminarSolicitud(solicitudId)
          router.push("/reuniones")
        }}
      />
    </div>
  )
}

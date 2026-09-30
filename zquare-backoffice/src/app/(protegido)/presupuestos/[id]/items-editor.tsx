"use client"

import { useState, useTransition } from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { guardarItems, type ItemEntrada } from "@/app/(protegido)/presupuestos/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { formatearMonto, type PresupuestoItem } from "@/lib/dominio"
import {
  calcularSubtotal,
  horasEstimadasItem,
  tarifaImplicita,
} from "@/lib/presupuestos"

type Fila = {
  descripcion: string
  horas: string
  horasInternas: string
  tarifa: string
}

const FILA_VACIA: Fila = { descripcion: "", horas: "", horasInternas: "", tarifa: "" }

function aNumero(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function subtotalFila(fila: Fila): number {
  return calcularSubtotal({ horas: aNumero(fila.horas), tarifa: aNumero(fila.tarifa) })
}

function horasFila(fila: Fila): number {
  return horasEstimadasItem({
    horas: aNumero(fila.horas),
    horas_internas: aNumero(fila.horasInternas),
    tarifa: null,
  })
}

export function ItemsEditor({
  presupuestoId,
  itemsIniciales,
  moneda,
}: {
  presupuestoId: string
  itemsIniciales: PresupuestoItem[]
  moneda: string
}) {
  const [filas, setFilas] = useState<Fila[]>(
    itemsIniciales.length > 0
      ? itemsIniciales.map((it) => ({
          descripcion: it.descripcion,
          horas: it.horas?.toString() ?? "",
          horasInternas: it.horas_internas?.toString() ?? "",
          tarifa: it.tarifa?.toString() ?? "",
        }))
      : [FILA_VACIA]
  )
  const [pendiente, iniciarTransicion] = useTransition()
  const [guardado, setGuardado] = useState(false)

  function actualizar(i: number, campo: keyof Fila, valor: string) {
    setFilas((prev) =>
      prev.map((f, idx) => (idx === i ? { ...f, [campo]: valor } : f))
    )
    setGuardado(false)
  }

  function agregar() {
    setFilas((prev) => [...prev, FILA_VACIA])
    setGuardado(false)
  }

  function quitar(i: number) {
    setFilas((prev) => prev.filter((_, idx) => idx !== i))
    setGuardado(false)
  }

  function guardar() {
    const items: ItemEntrada[] = filas
      .filter((f) => f.descripcion.trim().length > 0)
      .map((f) => ({
        descripcion: f.descripcion.trim(),
        horas: aNumero(f.horas),
        horas_internas: aNumero(f.horasInternas),
        tarifa: aNumero(f.tarifa) ?? 0,
      }))
    iniciarTransicion(async () => {
      await guardarItems(presupuestoId, items)
      setGuardado(true)
    })
  }

  const total = filas.reduce((acc, f) => acc + subtotalFila(f), 0)
  const horas = filas.reduce((acc, f) => acc + horasFila(f), 0)
  const porHora = tarifaImplicita(total, horas)

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden grid-cols-[1fr_5rem_5rem_7rem_7rem_2rem] gap-2 px-1 text-xs text-muted-foreground sm:grid">
        <span>Descripción</span>
        <span className="text-right">Horas</span>
        <span className="text-right" title="Lo que estimamos que lleva, aunque se cobre a precio cerrado">
          Horas int.
        </span>
        <span className="text-right">Tarifa</span>
        <span className="text-right">Subtotal</span>
        <span />
      </div>

      {filas.map((fila, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_2rem] items-center gap-2 sm:grid-cols-[1fr_5rem_5rem_7rem_7rem_2rem]"
        >
          <Input
            placeholder="Descripción del ítem"
            value={fila.descripcion}
            onChange={(e) => actualizar(i, "descripcion", e.target.value)}
            className="col-span-2 sm:col-span-1"
          />
          <Input
            type="number"
            min="0"
            step="0.5"
            placeholder="Horas"
            value={fila.horas}
            onChange={(e) => actualizar(i, "horas", e.target.value)}
            className="text-right"
          />
          <Input
            type="number"
            min="0"
            step="0.5"
            placeholder="Internas"
            aria-label="Horas internas"
            value={fila.horasInternas}
            onChange={(e) => actualizar(i, "horasInternas", e.target.value)}
            className="text-right"
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Tarifa"
            value={fila.tarifa}
            onChange={(e) => actualizar(i, "tarifa", e.target.value)}
            className="text-right"
          />
          <span className="text-right text-sm tabular-nums">
            {subtotalFila(fila).toLocaleString("es-UY")}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => quitar(i)}
            aria-label="Quitar ítem"
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}

      <div className="flex items-center justify-between border-t pt-3">
        <Button type="button" variant="outline" size="sm" onClick={agregar}>
          <PlusIcon data-icon="inline-start" />
          Agregar ítem
        </Button>
        <div className="flex flex-col items-end gap-0.5">
          <div>
            <span className="text-sm text-muted-foreground">Total </span>
            <span className="text-lg font-semibold tabular-nums">
              {formatearMonto(total, moneda)}
            </span>
          </div>
          {horas > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {horas.toLocaleString("es-UY")} h estimadas
              {porHora != null && ` · ${formatearMonto(porHora, moneda)} por hora`}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {guardado && !pendiente && (
          <span className="text-sm text-muted-foreground">Guardado ✓</span>
        )}
        <Button type="button" onClick={guardar} disabled={pendiente}>
          {pendiente && <Spinner data-icon="inline-start" />}
          Guardar ítems
        </Button>
      </div>
    </div>
  )
}

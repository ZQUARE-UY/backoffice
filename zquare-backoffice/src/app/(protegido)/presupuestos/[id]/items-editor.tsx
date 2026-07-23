"use client"

import { useState, useTransition } from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { guardarItems, type ItemEntrada } from "@/app/(protegido)/presupuestos/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { formatearMonto, type PresupuestoItem } from "@/lib/dominio"

type Fila = {
  descripcion: string
  horas: string
  tarifa: string
}

function aNumero(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function subtotalFila(fila: Fila): number {
  const horas = aNumero(fila.horas)
  const tarifa = aNumero(fila.tarifa) ?? 0
  return horas != null ? horas * tarifa : tarifa
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
          tarifa: it.tarifa?.toString() ?? "",
        }))
      : [{ descripcion: "", horas: "", tarifa: "" }]
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
    setFilas((prev) => [...prev, { descripcion: "", horas: "", tarifa: "" }])
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
        tarifa: aNumero(f.tarifa) ?? 0,
      }))
    iniciarTransicion(async () => {
      await guardarItems(presupuestoId, items)
      setGuardado(true)
    })
  }

  const total = filas.reduce((acc, f) => acc + subtotalFila(f), 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden grid-cols-[1fr_5rem_7rem_7rem_2rem] gap-2 px-1 text-xs text-muted-foreground sm:grid">
        <span>Descripción</span>
        <span className="text-right">Horas</span>
        <span className="text-right">Tarifa</span>
        <span className="text-right">Subtotal</span>
        <span />
      </div>

      {filas.map((fila, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_2rem] items-center gap-2 sm:grid-cols-[1fr_5rem_7rem_7rem_2rem]"
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
        <div className="text-right">
          <span className="text-sm text-muted-foreground">Total </span>
          <span className="text-lg font-semibold tabular-nums">
            {formatearMonto(total, moneda)}
          </span>
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

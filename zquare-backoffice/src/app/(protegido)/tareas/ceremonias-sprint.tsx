"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { paredEnZona } from "@/lib/disponibilidad"
import { diaSemana } from "@/lib/ceremonias"
import {
  TIPOS_CEREMONIA,
  type Ceremonia,
  type Sprint,
  type TipoCeremonia,
} from "@/lib/dominio"

import { ceremoniasDeSprint, definirCeremonias } from "./actions"

const DIAS_SEMANA = [
  { n: 1, label: "L" },
  { n: 2, label: "M" },
  { n: 3, label: "X" },
  { n: 4, label: "J" },
  { n: 5, label: "V" },
]

// Diálogo "Ceremonias" de un sprint: planning, daily (se repite por día
// hábil), review y retro. Guardar reemplaza el juego completo de ceremonias
// del sprint (ver lib/ceremonias.ts). Las actuales se cargan al abrir, para
// precargar el formulario con lo que ya está definido.
export function CeremoniasSprint({
  sprint,
  abierto,
  onAbiertoChange,
}: {
  sprint: Sprint
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}) {
  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="sm:max-w-lg">
        {/* El formulario se monta al abrir y se desmonta al cerrar: así cada
            apertura vuelve a cargar las ceremonias actuales sin estado viejo. */}
        {abierto && <Formulario sprint={sprint} cerrar={() => onAbiertoChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function Formulario({ sprint, cerrar }: { sprint: Sprint; cerrar: () => void }) {
  const [actuales, setActuales] = useState<Ceremonia[] | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  useEffect(() => {
    let cancelado = false
    ceremoniasDeSprint(sprint.id)
      .then((c) => {
        if (!cancelado) setActuales(c)
      })
      .catch((e) => {
        if (cancelado) return
        toast.error(e instanceof Error ? e.message : "No se pudieron cargar las ceremonias")
        cerrar()
      })
    return () => {
      cancelado = true
    }
  }, [sprint.id, cerrar])

  function onGuardar(formData: FormData) {
    iniciarTransicion(async () => {
      try {
        const r = await definirCeremonias(sprint.id, formData)
        cerrar()
        toast.success(
          r.creadas === 0
            ? `${sprint.nombre}: sin ceremonias`
            : `${sprint.nombre}: ${r.creadas} ${r.creadas === 1 ? "ceremonia" : "ceremonias"} en el calendario`
        )
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudieron guardar las ceremonias")
      }
    })
  }

  const sinFechas = !sprint.fecha_inicio || !sprint.fecha_fin
  const cerrado = sprint.estado === "cerrado"

  return (
    <form action={onGuardar}>
      <DialogHeader>
        <DialogTitle>Ceremonias de {sprint.nombre}</DialogTitle>
        <DialogDescription>
          {cerrado
            ? "El sprint está cerrado: sus ceremonias quedan como historial."
            : "Se ven en el calendario de Tareas. Guardar reemplaza las que el sprint ya tenía."}
          {!cerrado &&
            sinFechas &&
            " El sprint no tiene fechas: sin inicio y fin no se pueden generar las dailies."}
        </DialogDescription>
      </DialogHeader>
      {actuales === null ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Spinner /> Cargando…
        </div>
      ) : (
        <FieldGroup className="py-4">
          <Puntual tipo="planning" sprint={sprint} actuales={actuales} fechaDefault={sprint.fecha_inicio} />
          <Daily sprint={sprint} actuales={actuales} deshabilitada={sinFechas} />
          <Puntual tipo="review" sprint={sprint} actuales={actuales} fechaDefault={sprint.fecha_fin} />
          <Puntual tipo="retro" sprint={sprint} actuales={actuales} fechaDefault={sprint.fecha_fin} />
        </FieldGroup>
      )}
      <DialogFooter>
        <Button type="submit" disabled={pendiente || actuales === null || cerrado}>
          {pendiente && <Spinner data-icon="inline-start" />}
          Guardar ceremonias
        </Button>
      </DialogFooter>
    </form>
  )
}

function Encabezado({
  tipo,
  name,
  defaultChecked,
  disabled,
  detalle,
}: {
  tipo: TipoCeremonia
  name: string
  defaultChecked: boolean
  disabled?: boolean
  detalle?: string
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="size-4 accent-primary"
      />
      {TIPOS_CEREMONIA[tipo].label}
      {detalle && (
        <span className="font-normal text-muted-foreground">· {detalle}</span>
      )}
    </label>
  )
}

// Planning / review / retro: una fecha, una hora y una duración.
function Puntual({
  tipo,
  actuales,
  fechaDefault,
}: {
  tipo: "planning" | "review" | "retro"
  sprint: Sprint
  actuales: Ceremonia[]
  fechaDefault: string | null
}) {
  const actual = actuales.find((c) => c.tipo === tipo)
  const pared = actual ? paredEnZona(Date.parse(actual.inicio)) : null
  // Sin ceremonia previa el tipo arranca marcado si el sprint tiene la fecha
  // que le corresponde (primer día para planning, último para review/retro):
  // el default es "las ceremonias de siempre".
  const marcado = actual ? true : actuales.length === 0 && Boolean(fechaDefault)
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <Encabezado tipo={tipo} name={`${tipo}_on`} defaultChecked={marcado} />
      <div className="grid grid-cols-[1fr_auto_auto] gap-2">
        <Field>
          <FieldLabel htmlFor={`${tipo}_fecha`} className="text-xs">Fecha</FieldLabel>
          <Input
            id={`${tipo}_fecha`}
            name={`${tipo}_fecha`}
            type="date"
            defaultValue={pared?.fecha ?? fechaDefault ?? ""}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${tipo}_hora`} className="text-xs">Hora</FieldLabel>
          <Input
            id={`${tipo}_hora`}
            name={`${tipo}_hora`}
            type="time"
            step={300}
            defaultValue={pared?.hora ?? TIPOS_CEREMONIA[tipo].hora}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${tipo}_duracion`} className="text-xs">Min</FieldLabel>
          <Input
            id={`${tipo}_duracion`}
            name={`${tipo}_duracion`}
            type="number"
            min={5}
            max={480}
            step={5}
            className="w-20"
            defaultValue={actual?.duracion_min ?? TIPOS_CEREMONIA[tipo].duracion}
          />
        </Field>
      </div>
    </div>
  )
}

// Daily: hora, duración y días de la semana; se genera una por día hábil
// dentro de las fechas del sprint.
function Daily({
  actuales,
  deshabilitada,
}: {
  sprint: Sprint
  actuales: Ceremonia[]
  deshabilitada: boolean
}) {
  const dailies = actuales.filter((c) => c.tipo === "daily")
  const primera = dailies[0]
  const pared = primera ? paredEnZona(Date.parse(primera.inicio)) : null
  const diasActuales = new Set(
    dailies.map((c) => diaSemana(paredEnZona(Date.parse(c.inicio)).fecha))
  )
  const marcado = deshabilitada ? false : dailies.length > 0 || actuales.length === 0
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <Encabezado
        tipo="daily"
        name="daily_on"
        defaultChecked={marcado}
        disabled={deshabilitada}
        detalle={dailies.length > 0 ? `${dailies.length} en el sprint` : "una por día hábil"}
      />
      <div className="grid grid-cols-[1fr_auto_auto] gap-2">
        <Field>
          <FieldLabel className="text-xs">Días</FieldLabel>
          <div className="flex h-9 items-center gap-3">
            {DIAS_SEMANA.map((d) => (
              <label key={d.n} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  name="daily_dias"
                  value={d.n}
                  disabled={deshabilitada}
                  defaultChecked={dailies.length > 0 ? diasActuales.has(d.n) : true}
                  className="size-4 accent-primary"
                />
                {d.label}
              </label>
            ))}
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="daily_hora" className="text-xs">Hora</FieldLabel>
          <Input
            id="daily_hora"
            name="daily_hora"
            type="time"
            step={300}
            disabled={deshabilitada}
            defaultValue={pared?.hora ?? TIPOS_CEREMONIA.daily.hora}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="daily_duracion" className="text-xs">Min</FieldLabel>
          <Input
            id="daily_duracion"
            name="daily_duracion"
            type="number"
            min={5}
            max={480}
            step={5}
            className="w-20"
            disabled={deshabilitada}
            defaultValue={primera?.duracion_min ?? TIPOS_CEREMONIA.daily.duracion}
          />
        </Field>
      </div>
    </div>
  )
}

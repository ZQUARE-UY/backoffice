import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// Controles de la columna de datos de un Popover: un rótulo tenue arriba y
// un control nativo (select con optgroup, date) de 36px. Nativos a propósito:
// accesibles de entrada y, en celular, abren el selector del sistema.

export function CampoDato({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={htmlFor} className="text-xs leading-4 text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

const CONTROL =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-card px-2.5 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function SelectNativo({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <span className="relative flex">
      <select className={cn(CONTROL, "appearance-none pr-8", className)} {...props}>
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  )
}

export function FechaNativa({ className, ...props }: React.ComponentProps<"input">) {
  return <input type="date" className={cn(CONTROL, className)} {...props} />
}

// Interruptor (role="switch") con su texto al lado.
export function Interruptor({
  checked,
  onCheckedChange,
  children,
  id,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  children: React.ReactNode
  id?: string
}) {
  return (
    <span className="flex items-start gap-2.5 text-[13px]">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative mt-0.5 h-5 w-[34px] shrink-0 rounded-full transition-colors",
          checked ? "bg-foreground" : "bg-input"
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] size-3.5 rounded-full bg-card transition-[left]",
            checked ? "left-[17px]" : "left-[3px]"
          )}
        />
      </button>
      <label htmlFor={id} className="cursor-pointer">
        {children}
      </label>
    </span>
  )
}

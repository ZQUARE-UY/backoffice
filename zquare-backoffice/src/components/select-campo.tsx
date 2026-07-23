import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type Opcion = { valor: string; label: string }

// Select nativo estilizado. Elegido sobre el Select de base-ui para estos
// enums simples porque el popup portaleado de base-ui entra en conflicto con
// el Dialog (lo cierra), y el nativo envía el valor por FormData sin trucos.
export function SelectCampo({
  name,
  opciones,
  defaultValue,
  id,
  triggerClassName,
}: {
  name: string
  opciones: Opcion[]
  defaultValue: string
  id?: string
  triggerClassName?: string
}) {
  return (
    <div className={cn("relative", triggerClassName)}>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        className={cn(
          "flex h-8 w-full appearance-none items-center rounded-lg border border-input bg-transparent py-2 pr-8 pl-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"
        )}
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

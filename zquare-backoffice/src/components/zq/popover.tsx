"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { CheckIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogPortal, DialogTitle } from "@/components/ui/dialog"
import { useEsCelular } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

// Popover del rediseño (.zq-velo + .zq-popover): fichas y formularios sin
// salir de la pantalla.
//
// Escritorio: fondo oscurecido al 22% y borroso, panel centrado de radio 14px
// en dos columnas — a la izquierda `children` (título, texto, comentarios), a
// la derecha `datos` sobre el fondo de página, con `acciones` abajo a la
// derecha. Sin `datos` es de una columna. `falta` va abajo a la izquierda en
// texto tenue ("Falta el título").
//
// Celular (<720px): la misma ficha como Hoja inferior — radio 24px arriba,
// manija, los datos debajo del contenido y los botones a todo el ancho.
//
// Clic afuera y Esc cierran (los da el Dialog). Con `onSubmit` todo el panel
// es un <form>, así Enter guarda.
export function Popover({
  open,
  onOpenChange,
  children,
  datos,
  acciones,
  falta,
  onSubmit,
  className,
  "aria-label": ariaLabel,
}: {
  open: boolean
  onOpenChange: (abierto: boolean) => void
  children: React.ReactNode
  datos?: React.ReactNode
  acciones?: React.ReactNode
  falta?: string | null
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void
  className?: string
  "aria-label"?: string
}) {
  const esCelular = useEsCelular()

  const faltaNodo = falta ? (
    <p className="zq-falta" aria-live="polite">
      {falta}
    </p>
  ) : null
  const pie = acciones ? <div className="zq-popover-pie">{acciones}</div> : null

  const cuerpo = esCelular ? (
    <>
      <span className="zq-manija" aria-hidden="true" />
      {children}
      {datos && <div className="zq-popover-datos">{datos}</div>}
      {faltaNodo}
      {pie}
    </>
  ) : (
    <>
      <div className="zq-popover-contenido">
        {children}
        {datos && faltaNodo}
      </div>
      {datos ? (
        <div className="zq-popover-datos">
          {datos}
          {pie}
        </div>
      ) : (
        (faltaNodo || pie) && (
          <div className="flex items-end justify-between gap-3 px-6 pb-5">
            {faltaNodo ?? <span />}
            {pie}
          </div>
        )
      )}
      <DialogClose
        render={<Button variant="ghost" size="icon" className="zq-cerrar" aria-label="Cerrar" />}
      >
        <XIcon aria-hidden="true" />
      </DialogClose>
    </>
  )

  const unaColumna = !datos && !esCelular

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogPrimitive.Backdrop className={esCelular ? "zq-hoja-velo" : "zq-velo"} />
        <DialogPrimitive.Popup
          // CapturaRapida usa este slot para no abrirse encima de otra ficha.
          data-slot="dialog-content"
          aria-label={ariaLabel}
          data-una-columna={unaColumna || undefined}
          className={cn(
            esCelular ? "zq-hoja" : "zq-popover",
            unaColumna && "flex-col",
            className
          )}
          render={onSubmit ? <form onSubmit={onSubmit} /> : undefined}
        >
          {cuerpo}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}

// Título de la ficha, en display de 26px. Es el título accesible del diálogo.
export function PopoverTitulo({ className, ...props }: React.ComponentProps<typeof DialogTitle>) {
  return (
    <DialogTitle
      className={cn("m-0 font-display text-[26px] leading-8 font-normal", className)}
      {...props}
    />
  )
}

// Rótulo de un dato de la columna derecha ("Columna", "Responsable").
export function PopoverRotulo({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("text-xs leading-4 text-muted-foreground", className)} {...props} />
}

// Botón secundario del pie (Cancelar / Cerrar): cierra el popover.
export function PopoverCancelar({ children = "Cancelar" }: { children?: React.ReactNode }) {
  return (
    <DialogClose render={<Button variant="ghost" type="button" className="zq-cancelar" />}>
      {children}
    </DialogClose>
  )
}

// Botón primario del pie. Mientras no se pueda guardar queda al 45% y con
// aria-disabled (sigue enfocable, así el lector de pantalla llega y lee qué
// falta); `guardado` muestra "✓ Guardado" o el texto que se pase.
export function PopoverPrimario({
  listo = true,
  guardado = false,
  textoGuardado = "Guardado",
  pendiente = false,
  children,
  onClick,
  type = "submit",
  className,
  ...props
}: React.ComponentProps<typeof Button> & {
  listo?: boolean
  guardado?: boolean
  textoGuardado?: string
  pendiente?: boolean
}) {
  const bloqueado = !listo || pendiente
  return (
    <Button
      type={type}
      aria-disabled={bloqueado || undefined}
      className={cn(!listo && "zq-primario-pendiente", className)}
      onClick={(e) => {
        if (bloqueado) {
          e.preventDefault()
          return
        }
        onClick?.(e)
      }}
      {...props}
    >
      {guardado ? (
        <>
          <CheckIcon aria-hidden="true" />
          {textoGuardado}
        </>
      ) : (
        children
      )}
    </Button>
  )
}

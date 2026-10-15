"use client"

import { useEffect, useState, useTransition } from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { EVENTO_CREAR } from "@/components/captura-rapida"
import { Button } from "@/components/ui/button"
import { CampoDato, FechaNativa, SelectNativo } from "@/components/zq/campos"
import { Popover, PopoverCancelar, PopoverPrimario } from "@/components/zq/popover"
import {
  CATEGORIAS_SUGERIDAS,
  FONDO_COMUN,
  type Cliente,
  type Proyecto,
  type Socio,
} from "@/lib/dominio"
import { hoyUruguay } from "@/lib/finanzas"
import { formatearNumero, iniciales } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { crearLiquidacion, crearMovimiento } from "./actions"

type Tipo = "ingreso" | "gasto" | "transferencia"

// "8.169,55" o "8169.55": con coma, la coma es el decimal y los puntos son
// miles; sin coma, el punto es el decimal (así se tipea en el teclado).
function leerMonto(texto: string): number {
  const t = texto.trim()
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t
  const n = Number(normal)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export type TransferenciaInicial = { de: string; para: string; monto: number }

type Props = {
  socios: Socio[]
  clientes: Pick<Cliente, "id" | "nombre">[]
  proyectos: Pick<Proyecto, "id" | "nombre" | "cliente_id">[]
  // La tarjeta Recurrentes abre esto con "Se repite" ya elegido.
  recurrente?: boolean
  tipoInicial?: Tipo
  // "Registrar" una transferencia sugerida: viene armada.
  transferencia?: TransferenciaInicial
  etiqueta?: React.ReactNode
  variante?: "default" | "outline" | "ghost"
  tamano?: "default" | "sm"
  // El botón flotante "+" de celular abre este alta (una sola instancia por
  // pantalla debería escucharlo).
  escucharCrear?: boolean
  className?: string
}

// Alta de movimientos (Popover): ingreso, gasto o transferencia entre socios.
// Un ingreso o gasto que "se repite" crea el recurrente con este cobro como
// el primero; una transferencia es una liquidación (salda el balance, no es
// ingreso ni gasto).
export function NuevoMovimiento({
  recurrente = false,
  tipoInicial = "gasto",
  transferencia,
  etiqueta,
  variante,
  tamano,
  escucharCrear = false,
  className,
  ...props
}: Props) {
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    if (!escucharCrear) return
    function abrir(e: Event) {
      e.preventDefault()
      setAbierto(true)
    }
    window.addEventListener(EVENTO_CREAR, abrir)
    return () => window.removeEventListener(EVENTO_CREAR, abrir)
  }, [escucharCrear])

  return (
    <>
      <Button
        variant={variante ?? (recurrente ? "outline" : "default")}
        size={tamano ?? (recurrente ? "sm" : "default")}
        className={className}
        onClick={() => setAbierto(true)}
      >
        {etiqueta ?? (
          <>
            <PlusIcon data-icon="inline-start" />
            {recurrente ? "Nuevo recurrente" : "Nuevo movimiento"}
          </>
        )}
      </Button>
      {/* Se monta al abrir: cada apertura arranca con el formulario limpio. */}
      {abierto && (
        <Formulario
          {...props}
          onCerrar={() => setAbierto(false)}
          tipoInicial={transferencia ? "transferencia" : tipoInicial}
          repiteInicial={recurrente ? "mensual" : ""}
          transferencia={transferencia}
        />
      )}
    </>
  )
}

function Formulario({
  socios,
  clientes,
  proyectos,
  onCerrar,
  tipoInicial,
  repiteInicial,
  transferencia,
}: Omit<Props, "recurrente" | "etiqueta" | "variante" | "tamano" | "tipoInicial" | "escucharCrear" | "className"> & {
  onCerrar: () => void
  tipoInicial: Tipo
  repiteInicial: "" | "mensual" | "anual"
}) {
  const [abierto, setAbierto] = useState(true)
  const [tipo, setTipo] = useState<Tipo>(tipoInicial)
  const [moneda, setMoneda] = useState("USD")
  const [monto, setMonto] = useState(transferencia ? String(transferencia.monto) : "")
  const [cotizacion, setCotizacion] = useState("")
  const [quien, setQuien] = useState<string>(FONDO_COMUN)
  const [de, setDe] = useState(transferencia?.de ?? socios[0]?.id ?? "")
  const [para, setPara] = useState(transferencia?.para ?? socios[1]?.id ?? "")
  const [divide, setDivide] = useState<"todos" | "elegir">("todos")
  const [participan, setParticipan] = useState<Set<string>>(() => new Set(socios.map((s) => s.id)))
  const [repite, setRepite] = useState(repiteInicial)
  const [guardado, setGuardado] = useState(false)
  const [pendiente, iniciarTransicion] = useTransition()

  const nombre = new Map(socios.map((s) => [s.id, s.nombre.split(" ")[0]]))
  const n = leerMonto(monto)
  const esTransferencia = tipo === "transferencia"
  const entre = divide === "todos" ? socios.map((s) => s.id) : socios.filter((s) => participan.has(s.id)).map((s) => s.id)
  const cuota = entre.length > 0 ? n / entre.length : 0
  const plata = (v: number) => `${moneda} ${formatearNumero(v, 2)}`

  // Qué pasa con este movimiento, en una frase que se recalcula.
  const resumen = esTransferencia
    ? de === para
      ? "Elegí dos socios distintos."
      : `${nombre.get(de)} le pasa ${plata(n)} a ${nombre.get(para)} y se descuenta de lo que le debe.`
    : quien === FONDO_COMUN
      ? `${tipo === "gasto" ? "Sale de" : "Entra a"} la cuenta de la empresa. No genera deuda entre socios.`
      : entre.length === 0
        ? "Elegí entre quiénes se divide."
        : tipo === "gasto"
          ? `Cada socio le debe ${plata(cuota)} a ${nombre.get(quien)}.`
          : `${nombre.get(quien)} le debe ${plata(cuota)} a cada socio.`

  const falta =
    n <= 0
      ? "Falta el monto"
      : moneda === "UYU" && !(Number(cotizacion.replace(",", ".")) > 0)
        ? "Falta la cotización"
        : esTransferencia && de === para
          ? "Paga y recibe tienen que ser distintos"
          : !esTransferencia && quien !== FONDO_COMUN && entre.length === 0
            ? "Elegí entre quiénes se divide"
            : null
  const listo = !falta && !guardado

  function cerrar() {
    setAbierto(false)
    setTimeout(onCerrar, 200)
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!listo || pendiente) return
    const form = new FormData(e.currentTarget)
    const datos = new FormData()
    datos.set("monto", String(n))
    datos.set("moneda", moneda)
    datos.set("tc_a_usd", cotizacion.replace(",", "."))
    datos.set("fecha", String(form.get("fecha") ?? ""))

    if (esTransferencia) {
      datos.set("de_socio_id", de)
      datos.set("para_socio_id", para)
      datos.set("nota", String(form.get("descripcion") ?? ""))
    } else {
      datos.set("tipo", tipo)
      datos.set("descripcion", String(form.get("descripcion") ?? ""))
      datos.set("categoria", String(form.get("categoria") ?? ""))
      datos.set("estado", String(form.get("estado") ?? "confirmado"))
      datos.set("comprobante_url", String(form.get("comprobante_url") ?? ""))
      datos.set("pagado_por", quien)
      const destino = String(form.get("destino") ?? "")
      if (destino.startsWith("p:")) {
        const proyecto = proyectos.find((p) => p.id === destino.slice(2))
        datos.set("proyecto_id", proyecto?.id ?? "")
        datos.set("cliente_id", proyecto?.cliente_id ?? "")
      } else if (destino.startsWith("c:")) {
        datos.set("cliente_id", destino.slice(2))
      }
      if (quien !== FONDO_COMUN) {
        for (const id of entre) {
          datos.append("participante", id)
          datos.set(`partes_${id}`, "1")
        }
      }
      if (repite) {
        datos.set("se_repite", "1")
        datos.set("frecuencia", repite)
        datos.set("fecha_inicio", String(form.get("fecha") ?? ""))
      }
    }

    iniciarTransicion(async () => {
      try {
        await (esTransferencia ? crearLiquidacion(datos) : crearMovimiento(datos))
        setGuardado(true)
        toast.success(esTransferencia ? "Transferencia registrada" : "Movimiento guardado")
        setTimeout(cerrar, 700)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar")
      }
    })
  }

  const conCliente = proyectos.filter((p) => p.cliente_id)
  const internos = proyectos.filter((p) => !p.cliente_id)
  const etiquetaGuardar = { ingreso: "Guardar ingreso", gasto: "Guardar gasto", transferencia: "Guardar transferencia" }[tipo]

  return (
    <Popover
      open={abierto}
      onOpenChange={(v) => !v && !pendiente && cerrar()}
      aria-label="Nuevo movimiento"
      onSubmit={onSubmit}
      falta={guardado ? null : falta}
      datos={
        <>
          {!esTransferencia && (
            <CampoDato label="Categoría" htmlFor="nm-categoria">
              <SelectNativo id="nm-categoria" name="categoria" defaultValue={tipo === "ingreso" ? "Cobro a cliente" : ""}>
                <option value="">Sin categoría</option>
                {CATEGORIAS_SUGERIDAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectNativo>
            </CampoDato>
          )}
          <CampoDato label={repite ? "Primer cobro" : "Fecha"} htmlFor="nm-fecha">
            <FechaNativa id="nm-fecha" name="fecha" defaultValue={hoyUruguay()} required />
          </CampoDato>
          {!esTransferencia && (
            <>
              {quien !== FONDO_COMUN && (
                <CampoDato label="Se divide entre" htmlFor="nm-divide">
                  <SelectNativo
                    id="nm-divide"
                    value={divide}
                    onChange={(e) => setDivide(e.target.value as "todos" | "elegir")}
                  >
                    <option value="todos">Los {socios.length}, partes iguales</option>
                    <option value="elegir">Elegir socios…</option>
                  </SelectNativo>
                  {divide === "elegir" && (
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {socios.map((s) => {
                        const on = participan.has(s.id)
                        return (
                          <button
                            key={s.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              setParticipan((p) => {
                                const sig = new Set(p)
                                if (on) sig.delete(s.id)
                                else sig.add(s.id)
                                return sig
                              })
                            }
                            className={cn("zq-chip min-h-7 text-xs", on && "bg-lima text-carbon")}
                          >
                            {nombre.get(s.id)}
                          </button>
                        )
                      })}
                    </span>
                  )}
                </CampoDato>
              )}
              <CampoDato label="Cliente o proyecto" htmlFor="nm-destino">
                <SelectNativo id="nm-destino" name="destino" defaultValue="">
                  <option value="">Ninguno</option>
                  {clientes.length > 0 && (
                    <optgroup label="Clientes">
                      {clientes.map((c) => (
                        <option key={c.id} value={`c:${c.id}`}>
                          {c.nombre}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {conCliente.length + internos.length > 0 && (
                    <optgroup label="Proyectos">
                      {[...conCliente, ...internos].map((p) => (
                        <option key={p.id} value={`p:${p.id}`}>
                          {p.nombre}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </SelectNativo>
              </CampoDato>
              <CampoDato label="Se repite" htmlFor="nm-repite">
                <SelectNativo
                  id="nm-repite"
                  value={repite}
                  onChange={(e) => setRepite(e.target.value as "" | "mensual" | "anual")}
                >
                  <option value="">No</option>
                  <option value="mensual">Todos los meses</option>
                  <option value="anual">Todos los años</option>
                </SelectNativo>
              </CampoDato>
              {!repite && (
                <CampoDato label="Estado" htmlFor="nm-estado">
                  <SelectNativo id="nm-estado" name="estado" defaultValue="confirmado">
                    <option value="confirmado">Confirmado</option>
                    <option value="previsto">Previsto</option>
                  </SelectNativo>
                </CampoDato>
              )}
              <CampoDato label="Comprobante (link)" htmlFor="nm-comprobante">
                <input
                  id="nm-comprobante"
                  name="comprobante_url"
                  type="url"
                  placeholder="https://drive.google.com/…"
                  className="h-9 w-full rounded-lg border border-input bg-card px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </CampoDato>
            </>
          )}
        </>
      }
      acciones={
        <>
          <PopoverCancelar />
          <PopoverPrimario listo={listo} pendiente={pendiente} guardado={guardado}>
            {etiquetaGuardar}
          </PopoverPrimario>
        </>
      }
    >
      <p className="zq-rotulo">Nuevo movimiento</p>
      <div role="group" aria-label="Tipo" className="flex rounded-[10px] bg-muted p-[3px]">
        {(["ingreso", "gasto", "transferencia"] as Tipo[]).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tipo === t}
            onClick={() => setTipo(t)}
            className={cn(
              "min-h-9 flex-1 rounded-lg text-[13px] capitalize",
              tipo === t ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2.5">
        <SelectNativo
          aria-label="Moneda"
          value={moneda}
          onChange={(e) => setMoneda(e.target.value)}
          className="w-[84px] font-semibold"
        >
          <option value="USD">USD</option>
          <option value="UYU">UYU</option>
        </SelectNativo>
        <input
          value={monto}
          onChange={(e) => {
            setMonto(e.target.value)
            setGuardado(false)
          }}
          inputMode="decimal"
          placeholder="0"
          aria-label="Monto"
          autoComplete="off"
          className="zq-num w-full border-0 border-b-2 border-input bg-transparent pb-0.5 font-display text-5xl leading-[56px] outline-none focus-visible:border-foreground"
        />
      </div>
      {moneda === "UYU" && (
        <label className="flex items-center gap-2.5 text-xs text-muted-foreground">
          Cotización: 1 USD =
          <input
            value={cotizacion}
            onChange={(e) => setCotizacion(e.target.value)}
            inputMode="decimal"
            placeholder="40"
            aria-label="Pesos por dólar"
            className="w-20 rounded-md border border-input bg-transparent px-2 py-1 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          UYU
        </label>
      )}
      <input
        name="descripcion"
        placeholder={esTransferencia ? "Nota (opcional)" : repite ? "¿De qué es? (ej. Google Workspace)" : "¿De qué es?"}
        aria-label="Descripción"
        required={Boolean(repite) && !esTransferencia}
        className="w-full rounded-[10px] border border-input bg-transparent px-3 py-2.5 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />

      {esTransferencia ? (
        <div className="flex flex-wrap items-center gap-3.5">
          <ElegirSocio etiqueta="Paga" socios={socios} valor={de} onChange={setDe} />
          <span aria-hidden="true" className="mt-5 text-xl text-muted-foreground">
            →
          </span>
          <ElegirSocio etiqueta="Recibe" socios={socios} valor={para} onChange={setPara} />
        </div>
      ) : (
        <ElegirSocio
          etiqueta={tipo === "gasto" ? "¿Quién lo pagó?" : "¿Quién lo cobró?"}
          socios={socios}
          valor={quien}
          onChange={setQuien}
          conFondo
        />
      )}

      <p className="m-0 mt-auto rounded-[10px] bg-muted px-3 py-2.5 text-[13px]" aria-live="polite">
        {resumen}
      </p>
    </Popover>
  )
}

// Avatares que se tocan para elegir un socio (y, en ingresos y gastos, el
// fondo común).
function ElegirSocio({
  etiqueta,
  socios,
  valor,
  onChange,
  conFondo = false,
}: {
  etiqueta: string
  socios: Socio[]
  valor: string
  onChange: (v: string) => void
  conFondo?: boolean
}) {
  const clase = (on: boolean) =>
    cn(
      "inline-flex h-11 min-w-11 items-center justify-center rounded-full text-[11px] font-bold transition-shadow",
      on
        ? "bg-lima text-carbon ring-2 ring-foreground ring-offset-2 ring-offset-card"
        : "bg-muted text-muted-foreground hover:text-foreground"
    )
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
      <div className="flex flex-wrap items-center gap-2">
        {socios.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={valor === s.id}
            aria-label={s.nombre}
            title={s.nombre}
            onClick={() => onChange(s.id)}
            className={clase(valor === s.id)}
          >
            {iniciales(s.nombre)}
          </button>
        ))}
        {conFondo && (
          <button
            type="button"
            aria-pressed={valor === FONDO_COMUN}
            onClick={() => onChange(FONDO_COMUN)}
            className={cn(clase(valor === FONDO_COMUN), "px-3.5")}
          >
            Fondo común
          </button>
        )}
      </div>
    </div>
  )
}

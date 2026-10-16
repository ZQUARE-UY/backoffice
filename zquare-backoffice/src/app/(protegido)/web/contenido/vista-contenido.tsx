import { ArrowDownIcon, ArrowUpIcon, ExternalLinkIcon } from "lucide-react"

import { BotonEliminar } from "@/components/boton-eliminar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Encabezado } from "@/components/zq/encabezado"
import { TIPOS, type Bloque, type SocioWeb, type TipoBloque } from "@/lib/contenido-web"
import { cn } from "@/lib/utils"

import { PESTANAS_WEB } from "../pestanas"
import {
  actualizarSocioWeb,
  eliminarBloque,
  moverBloque,
  moverSocio,
  publicarBloque,
} from "./actions"
import { EditorBloque } from "./editor-bloque"

// Web → Contenido: lo que zquare.uy muestra en Servicios, Método, Equipo y
// Testimonios. La web lo lee de /api/publico/contenido (cacheado un minuto)
// y, si no puede, usa el texto que tiene escrito en su HTML.
export function VistaContenido({ bloques, socios }: { bloques: Bloque[]; socios: SocioWeb[] }) {
  return (
    <>
      <Encabezado
        titulo="Web"
        pestanas={PESTANAS_WEB}
        acciones={
          <Button variant="ghost" size="sm" nativeButton={false} render={<a href="https://zquare.uy" target="_blank" rel="noreferrer" />}>
            Ver zquare.uy
            <ExternalLinkIcon data-icon="inline-end" />
          </Button>
        }
      />
      <p className="m-0 text-sm text-muted-foreground">
        Los cambios se ven en zquare.uy en hasta un minuto. Lo que no esté publicado no aparece en la web.
      </p>

      {(["servicio", "paso"] as const).map((tipo) => (
        <SeccionBloques key={tipo} tipo={tipo} bloques={bloques.filter((b) => b.tipo === tipo)} />
      ))}
      <SeccionEquipo socios={socios} />
      <SeccionBloques tipo="testimonio" bloques={bloques.filter((b) => b.tipo === "testimonio")} />
    </>
  )
}

function SeccionBloques({ tipo, bloques }: { tipo: TipoBloque; bloques: Bloque[] }) {
  const def = TIPOS[tipo]
  const publicados = bloques.filter((b) => b.publicado).length
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-lg font-semibold tracking-tight">{def.titulo}</h2>
          <p className="m-0 text-sm text-muted-foreground">
            {publicados} de {bloques.length} publicados{def.nota ? ` · ${def.nota}` : ""}
          </p>
        </div>
        <EditorBloque tipo={tipo} />
      </div>
      {bloques.length === 0 ? (
        <p className="m-0 rounded-xl border border-dashed border-input px-4 py-3.5 text-muted-foreground">
          Sin {def.titulo.toLowerCase()} cargados: la web muestra los que tiene escritos.
        </p>
      ) : (
        <ul className="m-0 list-none rounded-xl border bg-card p-0">
          {bloques.map((b, i) => (
            <li
              key={b.id}
              className={cn("flex flex-wrap items-start gap-3 border-t px-4 py-3.5 first:border-t-0", !b.publicado && "opacity-60")}
            >
              <Flechas
                arriba={i > 0 ? moverBloque.bind(null, b.id, tipo, -1) : null}
                abajo={i < bloques.length - 1 ? moverBloque.bind(null, b.id, tipo, 1) : null}
                nombre={b.es.titulo || b.nombre || def.singular}
              />
              <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
                <p className="m-0 font-semibold">
                  {tipo === "testimonio" ? `${b.nombre ?? "Sin nombre"} · ${b.es.cargo || "—"}, ${b.empresa ?? "—"}` : b.es.titulo}
                  {tipo === "paso" && b.es.duracion && <span className="font-normal text-muted-foreground"> · {b.es.duracion}</span>}
                </p>
                <p className="m-0 text-sm text-muted-foreground">
                  {tipo === "testimonio" ? `“${b.es.cita}”` : b.es.descripcion}
                </p>
                <p className="m-0 text-xs text-muted-foreground">
                  EN: {tipo === "testimonio" ? b.en.cita || "(usa el español)" : b.en.titulo || "(usa el español)"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <form action={publicarBloque.bind(null, b.id, !b.publicado)}>
                  <Button type="submit" variant={b.publicado ? "ghost" : "outline"} size="sm">
                    {b.publicado ? "Despublicar" : "Publicar"}
                  </Button>
                </form>
                <EditorBloque tipo={tipo} bloque={b} />
                <BotonEliminar
                  soloIcono
                  accion={eliminarBloque.bind(null, b.id)}
                  titulo={`¿Eliminar este ${def.singular}?`}
                  descripcion="Deja de aparecer en la web y en esta lista."
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SeccionEquipo({ socios }: { socios: SocioWeb[] }) {
  const visibles = socios.filter((s) => s.web_visible).length
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 text-lg font-semibold tracking-tight">Equipo</h2>
        <p className="m-0 text-sm text-muted-foreground">
          Sale de los socios. {visibles === 0 ? "Ninguno marcado: la web muestra el equipo que tiene escrito." : `${visibles} en la web.`}
        </p>
      </div>
      <ul className="m-0 list-none rounded-xl border bg-card p-0">
        {socios.map((s, i) => (
          <li key={s.id} className={cn("flex flex-wrap items-center gap-3 border-t px-4 py-3 first:border-t-0", !s.web_visible && "opacity-70")}>
            <Flechas
              arriba={i > 0 ? moverSocio.bind(null, s.id, -1) : null}
              abajo={i < socios.length - 1 ? moverSocio.bind(null, s.id, 1) : null}
              nombre={s.nombre}
            />
            <form action={actualizarSocioWeb.bind(null, s.id)} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <label className="flex min-w-[180px] items-center gap-2 font-semibold">
                <input type="checkbox" name="web_visible" defaultChecked={s.web_visible} className="size-4 accent-[var(--lima)]" />
                {s.nombre}
              </label>
              <Input
                name="web_cargo_es"
                defaultValue={s.web_cargo_es ?? ""}
                placeholder="Cargo (ej. Socio · Ingeniería)"
                aria-label={`Cargo de ${s.nombre} en español`}
                maxLength={80}
                className="h-9 flex-[1_1_180px]"
              />
              <Input
                name="web_cargo_en"
                defaultValue={s.web_cargo_en ?? ""}
                placeholder="Role (e.g. Partner · Engineering)"
                aria-label={`Cargo de ${s.nombre} en inglés`}
                maxLength={80}
                className="h-9 flex-[1_1_180px]"
              />
              <Button type="submit" variant="outline" size="sm">
                Guardar
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Flechas({
  arriba,
  abajo,
  nombre,
}: {
  arriba: (() => Promise<void>) | null
  abajo: (() => Promise<void>) | null
  nombre: string
}) {
  return (
    <div className="flex flex-col">
      <form action={arriba ?? undefined}>
        <Button type="submit" variant="ghost" size="icon-sm" disabled={!arriba} aria-label={`Subir ${nombre}`}>
          <ArrowUpIcon />
        </Button>
      </form>
      <form action={abajo ?? undefined}>
        <Button type="submit" variant="ghost" size="icon-sm" disabled={!abajo} aria-label={`Bajar ${nombre}`}>
          <ArrowDownIcon />
        </Button>
      </form>
    </div>
  )
}

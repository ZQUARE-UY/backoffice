import Image from "next/image"
import { VideoIcon } from "lucide-react"

import { listarAgenda } from "@/lib/calendario"
import { paredEnZona } from "@/lib/disponibilidad"
import { googleConfigurado } from "@/lib/google"
import { fechaRelativa } from "@/lib/formato"

// Agenda de "Mi día": las reuniones de hoy y mañana del socio, leídas en vivo
// de su Google Calendar. Va en Suspense porque Google tarda; sin reuniones,
// la mascota.
export async function AgendaHoy({ email }: { email: string }) {
  if (!googleConfigurado()) {
    return <Vacia texto="Google Calendar no está configurado." />
  }

  let reuniones
  try {
    reuniones = (await listarAgenda([email], 2)).reuniones
  } catch {
    return <Vacia texto="No se pudo leer tu calendario." />
  }
  if (reuniones.length === 0) return <Vacia texto="Sin reuniones hoy ni mañana." />

  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {reuniones.slice(0, 5).map((r) => {
        const { fecha, hora } = r.todoElDia ? { fecha: r.inicio, hora: "" } : paredEnZona(Date.parse(r.inicio))
        return (
          <li key={r.id} className="flex items-start gap-3">
            <span className="zq-num w-16 shrink-0 text-xs leading-5 text-muted-foreground">
              {fechaRelativa(fecha) === "Hoy" ? hora || "Todo el día" : `${fechaRelativa(fecha)} ${hora}`}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{r.titulo}</span>
            {r.linkVideo && (
              <a
                href={r.linkVideo}
                target="_blank"
                rel="noreferrer"
                aria-label={`Entrar a ${r.titulo}`}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <VideoIcon className="size-4" aria-hidden="true" />
              </a>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Vacia({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-4">
      <Image src="/marca/mascota-cafe.svg" alt="" width={64} height={56} className="shrink-0" />
      <p className="m-0 text-muted-foreground">{texto}</p>
    </div>
  )
}

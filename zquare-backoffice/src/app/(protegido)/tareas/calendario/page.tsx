import { VistaTareas, type ParamsTareas } from "../vista-tareas"

export const metadata = { title: "Calendario" }

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<ParamsTareas>
}) {
  return <VistaTareas vista="calendario" params={await searchParams} />
}

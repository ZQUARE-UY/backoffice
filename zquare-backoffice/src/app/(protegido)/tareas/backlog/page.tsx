import { VistaTareas, type ParamsTareas } from "../vista-tareas"

export const metadata = { title: "Backlog" }

export default async function BacklogPage({
  searchParams,
}: {
  searchParams: Promise<ParamsTareas>
}) {
  return <VistaTareas vista="backlog" params={await searchParams} />
}

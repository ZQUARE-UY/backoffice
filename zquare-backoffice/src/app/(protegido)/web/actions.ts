"use server"

import { revalidatePath } from "next/cache"

import { crearCarpetaCliente, driveConfigurado } from "@/lib/drive"
import { idSocioActual } from "@/lib/socio-actual"
import { createClient } from "@/lib/supabase/server"

export type EstadoConsulta = "nueva" | "atendida" | "descartada"

function revalidar() {
  revalidatePath("/web")
  revalidatePath("/clientes")
  // El contador de consultas nuevas está en el sidebar (layout).
  revalidatePath("/", "layout")
}

export async function cambiarEstadoConsulta(id: string, estado: EstadoConsulta) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("consultas_web")
    .update({
      estado,
      revisada_por: estado === "nueva" ? null : await idSocioActual(),
      revisada_at: estado === "nueva" ? null : new Date().toISOString(),
    })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidar()
}

// Promover: la consulta pasa al resto del backoffice como cliente potencial
// nuevo (con su carpeta en Drive, como cualquier alta) y queda atendida.
export async function promoverACliente(consultaId: string) {
  const supabase = await createClient()
  const { data: c, error: errorConsulta } = await supabase
    .from("consultas_web")
    .select("nombre, email, empresa, mensaje, created_at, cliente_id")
    .eq("id", consultaId)
    .single<{ nombre: string; email: string; empresa: string | null; mensaje: string; created_at: string; cliente_id: string | null }>()
  if (errorConsulta || !c) throw new Error("No se encontró la consulta")
  if (c.cliente_id) return

  const socio = await idSocioActual()
  const { data: cliente, error } = await supabase
    .from("clientes")
    .insert({
      nombre: c.nombre,
      empresa: c.empresa,
      email: c.email,
      estado: "potencial",
      origen: "web",
      notas: `Consulta desde la web (${c.created_at.slice(0, 10)}):\n${c.mensaje}`,
      created_by: socio,
    })
    .select("id")
    .single<{ id: string }>()
  if (error || !cliente) throw new Error(error?.message ?? "No se pudo crear el cliente")

  // Carpeta en Drive (tolerante: si falla, el cliente igual queda creado).
  if (driveConfigurado()) {
    try {
      const carpetaId = await crearCarpetaCliente(c.nombre)
      await supabase.from("clientes").update({ drive_folder_id: carpetaId }).eq("id", cliente.id)
    } catch (e) {
      console.error("No se pudo crear la carpeta de Drive del cliente:", e)
    }
  }

  await vincular(consultaId, cliente.id, socio)
}

// La persona ya era cliente (mismo email): la consulta se cuelga de esa ficha.
export async function vincularACliente(consultaId: string, clienteId: string) {
  await vincular(consultaId, clienteId, await idSocioActual())
}

async function vincular(consultaId: string, clienteId: string, socio: string | null) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("consultas_web")
    .update({
      cliente_id: clienteId,
      estado: "atendida",
      revisada_por: socio,
      revisada_at: new Date().toISOString(),
    })
    .eq("id", consultaId)
  if (error) throw new Error(error.message)
  revalidar()
}

import {
  type BalanceSocio,
  type Cliente,
  type Liquidacion,
  type Movimiento,
  type MovimientoParticipacion,
  type MovimientoRecurrente,
  type Proyecto,
  type Socio,
} from "@/lib/dominio"
import { createClient } from "@/lib/supabase/server"

// Lo que leen Finanzas y su listado completo de movimientos.
export async function cargarFinanzas() {
  const supabase = await createClient()
  const [
    { data: movimientosData },
    { data: sociosData },
    { data: clientesData },
    { data: proyectosData },
    { data: participacionesData },
    { data: balanceData },
    { data: recurrentesData },
    { data: liquidacionesData },
  ] = await Promise.all([
    supabase
      .from("movimientos")
      .select("*")
      .is("deleted_at", null)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("socios").select("id, nombre, email").is("deleted_at", null).order("nombre"),
    supabase.from("clientes").select("id, nombre").is("deleted_at", null).order("nombre"),
    supabase.from("proyectos").select("id, nombre, cliente_id").is("deleted_at", null).order("nombre"),
    supabase.from("movimiento_participaciones").select("*"),
    supabase.from("balance_socios").select("*").order("nombre"),
    supabase
      .from("movimientos_recurrentes")
      .select("*")
      .is("deleted_at", null)
      .order("activo", { ascending: false })
      .order("descripcion"),
    supabase
      .from("liquidaciones")
      .select("*")
      .is("deleted_at", null)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
  ])

  return {
    movimientos: (movimientosData ?? []) as Movimiento[],
    socios: (sociosData ?? []) as Socio[],
    clientes: (clientesData ?? []) as Pick<Cliente, "id" | "nombre">[],
    proyectos: (proyectosData ?? []) as Pick<Proyecto, "id" | "nombre" | "cliente_id">[],
    participaciones: (participacionesData ?? []) as MovimientoParticipacion[],
    balance: (balanceData ?? []) as BalanceSocio[],
    recurrentes: (recurrentesData ?? []) as MovimientoRecurrente[],
    liquidaciones: (liquidacionesData ?? []) as Liquidacion[],
  }
}

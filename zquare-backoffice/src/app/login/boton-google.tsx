"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { createClient } from "@/lib/supabase/client"

export function BotonGoogle() {
  const [cargando, setCargando] = useState(false)

  async function iniciarSesion() {
    setCargando(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          hd: "zquare.uy",
          prompt: "select_account",
        },
      },
    })
    if (error) setCargando(false)
  }

  return (
    <Button onClick={iniciarSesion} disabled={cargando} className="w-full">
      {cargando && <Spinner data-icon="inline-start" />}
      Entrar con Google
    </Button>
  )
}

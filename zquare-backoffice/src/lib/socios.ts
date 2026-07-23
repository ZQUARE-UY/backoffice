const SOCIOS_DEFAULT = [
  "joaquin@zquare.uy",
  "nicolas@zquare.uy",
  "francisco@zquare.uy",
  "martin@zquare.uy",
]

export function emailsAutorizados(): string[] {
  const env = process.env.SOCIOS_AUTORIZADOS
  if (env) {
    return env
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  }
  return SOCIOS_DEFAULT
}

export function esEmailAutorizado(email?: string | null): boolean {
  if (!email) return false
  return emailsAutorizados().includes(email.toLowerCase())
}

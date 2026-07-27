import "server-only"

import { google } from "googleapis"

// Credenciales de la cuenta de servicio, guardadas como JSON en base64 en la
// env var (evita problemas con los saltos de línea de la private_key).
// Compartidas por las integraciones de Drive y Calendar.
export function credencialesServicio() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64
  if (!b64) throw new Error("Falta GOOGLE_SERVICE_ACCOUNT_KEY_B64")
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"))
}

export function clienteJwt(scopes: string[]) {
  const cred = credencialesServicio()
  return new google.auth.JWT({
    email: cred.client_email,
    key: cred.private_key,
    scopes,
  })
}

export function googleConfigurado(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64)
}

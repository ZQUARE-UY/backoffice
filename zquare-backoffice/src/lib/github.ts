import "server-only"

// Cliente REST de GitHub para espejar el tablero en issues (una sola dirección:
// backoffice → GitHub). El agente lee las issues; nadie las edita a mano, así
// que no hay webhook ni vuelta.
//
// Env vars (en .env.local y Vercel):
//   GITHUB_TOKEN        — fine-grained PAT con permiso Issues read/write sobre
//                         los repos destino.
//   GITHUB_OWNER        — org o usuario dueño de los repos (para Projects v2).
//   GITHUB_DEFAULT_REPO — "owner/repo" de las tareas sin proyecto.

const API = "https://api.github.com"
const API_VERSION = "2022-11-28"

export function githubConfigurado(): boolean {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_DEFAULT_REPO)
}

function token(): string {
  const t = process.env.GITHUB_TOKEN
  if (!t) throw new Error("Falta GITHUB_TOKEN")
  return t
}

async function githubFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })
  if (!res.ok) {
    throw new Error(
      `GitHub respondió ${res.status} en ${path}: ${(await res.text()).slice(0, 300)}`
    )
  }
  return (await res.json()) as T
}

export type Issue = { number: number; node_id: string; html_url: string; state: string }

// `repo` es "owner/repo".
export async function crearIssue(
  repo: string,
  datos: { title: string; body: string; labels?: string[] }
): Promise<Issue> {
  return githubFetch<Issue>(`/repos/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify(datos),
  })
}

export async function actualizarIssue(
  repo: string,
  numero: number,
  cambios: { title?: string; body?: string; labels?: string[]; state?: "open" | "closed" }
): Promise<Issue> {
  return githubFetch<Issue>(`/repos/${repo}/issues/${numero}`, {
    method: "PATCH",
    body: JSON.stringify(cambios),
  })
}

export async function comentarIssue(
  repo: string,
  numero: number,
  cuerpo: string
): Promise<{ id: number }> {
  return githubFetch<{ id: number }>(`/repos/${repo}/issues/${numero}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: cuerpo }),
  })
}

// Crea las labels que falten en el repo (mejor esfuerzo). GitHub rechaza crear
// una issue con una label inexistente, así que hay que asegurarlas antes. Un
// 422 acá es "ya existe": se ignora.
export async function asegurarLabels(repo: string, labels: string[]): Promise<void> {
  await Promise.all(
    labels.map(async (name) => {
      try {
        await githubFetch(`/repos/${repo}/labels`, {
          method: "POST",
          body: JSON.stringify({ name, color: "ededed" }),
        })
      } catch {
        // Ya existe o no se pudo crear: la issue igual se crea si existe.
      }
    })
  )
}

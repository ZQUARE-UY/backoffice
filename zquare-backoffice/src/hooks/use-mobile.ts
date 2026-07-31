import * as React from "react"

const MOBILE_BREAKPOINT = 768

// Suscripción a un media query con useSyncExternalStore: es el hook pensado
// para estado que vive afuera de React. La versión original de shadcn hacía
// setState dentro de un useEffect, que dispara un render en cascada (lo marca
// la regla react-hooks/set-state-in-effect).
function suscribir(alCambiar: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", alCambiar)
  return () => mql.removeEventListener("change", alCambiar)
}

function esMobile() {
  return window.innerWidth < MOBILE_BREAKPOINT
}

// En el server no hay viewport: se asume desktop, igual que antes (el hook
// devolvía `false` hasta que corría el efecto).
function esMobileEnServer() {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(suscribir, esMobile, esMobileEnServer)
}

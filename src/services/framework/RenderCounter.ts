/**
 * RenderCounter – conta commits do React (re-renders da aplicação).
 * Usado via Profiler em main.tsx. Não conta game loop / RAF.
 * Resetado a cada amostragem do overlay (~200ms).
 */

let appCommits = 0

export function recordAppCommit(): void {
  appCommits++
}

export function getRenderCount(): number {
  return appCommits
}

export function resetRenderCount(): void {
  appCommits = 0
}

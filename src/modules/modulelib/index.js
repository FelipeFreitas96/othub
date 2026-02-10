const registry = []

export function registerModule(name, init) {
  if (!name || typeof init !== 'function') return
  registry.push({ name, init })
}

export function loadModules() {
  for (const entry of registry) {
    try {
      entry.init()
    } catch {
      // keep startup resilient: one module failing should not block others
    }
  }
}

export function getRegisteredModules() {
  return [...registry]
}

export default {
  registerModule,
  loadModules,
  getRegisteredModules,
}

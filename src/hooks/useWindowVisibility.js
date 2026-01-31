/**
 * Hook genérico para persistir estado de visibilidade (ou qualquer objeto) no localStorage.
 * Qualquer janela/módulo pode usar com sua própria chave e valor padrão.
 *
 * @param {string} key - Chave no localStorage (ex: 'otclient-skills-bar-visibility')
 * @param {object} defaultValue - Estado inicial e forma padrão (novas chaves são preenchidas com ele)
 * @returns {[object, function]} [state, setState] - igual useState, mas com persistência
 */
import { useState, useEffect } from 'react'

function load(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { ...defaultValue }
    const parsed = JSON.parse(raw)
    return { ...defaultValue, ...parsed }
  } catch {
    return { ...defaultValue }
  }
}

export function useWindowVisibility(key, defaultValue) {
  const [state, setState] = useState(() => load(key, defaultValue))

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(state))
  }, [key, state])

  return [state, setState]
}

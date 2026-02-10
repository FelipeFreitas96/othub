import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  getDefaultLocale,
  getInstalledLocales,
  loadStoredLocale,
  storeLocale,
  translate,
} from './service/localesService'

const LocaleContext = createContext({
  locale: getDefaultLocale(),
  setLocale: () => {},
  tr: (text, ...args) => (args?.length ? String(text) : text),
  locales: getInstalledLocales(),
})

export function ClientLocalesProvider({ children }) {
  const [locale, setLocaleState] = useState(() => loadStoredLocale())

  const setLocale = useCallback((nextLocale) => {
    setLocaleState((prev) => {
      const normalized = nextLocale || prev
      storeLocale(normalized)
      return normalized
    })
  }, [])

  const tr = useCallback((text, ...args) => translate(locale, text, ...args), [locale])

  useEffect(() => {
    globalThis.tr = tr
    globalThis.onLocaleChanged = setLocale
    return () => {
      if (globalThis.tr === tr) {
        globalThis.tr = (text, ...args) => (args?.length ? String(text) : text)
      }
      if (globalThis.onLocaleChanged === setLocale) {
        globalThis.onLocaleChanged = undefined
      }
    }
  }, [tr, setLocale])

  const value = useMemo(() => ({
    locale,
    setLocale,
    tr,
    locales: getInstalledLocales(),
  }), [locale, setLocale, tr])

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  return useContext(LocaleContext)
}

export default ClientLocalesProvider


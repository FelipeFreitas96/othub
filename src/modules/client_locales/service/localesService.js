const STORAGE_KEY = 'otclient.web.locale'
const DEFAULT_LOCALE = 'en'

const LOCALES = {
  en: {
    languageName: 'English',
    translation: {
      'Enter Game': 'Enter Game',
      'Acc Name:': 'Acc Name:',
      'Password:': 'Password:',
      'Remember password': 'Remember password',
      'Forgot password and/or email': 'Forgot password and/or email',
      Server: 'Server',
      'Client Version': 'Client Version',
      Port: 'Port',
      'Auto login': 'Auto login',
      'Enable HTTP login': 'Enable HTTP login',
      Login: 'Login',
      'Create New Account': 'Create New Account',
      Connecting: 'Connecting...',
      Language: 'Language',
      'Server List': 'Server List',
      Select: 'Select',
      Cancel: 'Cancel',
      Add: 'Add',
      Name: 'Name',
      Host: 'Host',
      Remove: 'Remove',
      Close: 'Close',
      Terminal: 'Terminal',
      'Debug Info': 'Debug Info',
      FPS: 'FPS',
      Ping: 'Ping',
      Online: 'Online',
      Offline: 'Offline',
      Unknown: 'Unknown',
      'Open server list': 'Open server list',
    },
  },
  pt: {
    languageName: 'Português',
    translation: {
      'Enter Game': 'Entrar no Jogo',
      'Acc Name:': 'Conta:',
      'Password:': 'Senha:',
      'Remember password': 'Lembrar senha',
      'Forgot password and/or email': 'Esqueci senha e/ou email',
      Server: 'Servidor',
      'Client Version': 'Versão do Cliente',
      Port: 'Porta',
      'Auto login': 'Login automático',
      'Enable HTTP login': 'Habilitar login HTTP',
      Login: 'Entrar',
      'Create New Account': 'Criar Nova Conta',
      Connecting: 'Conectando...',
      Language: 'Idioma',
      'Server List': 'Lista de Servidores',
      Select: 'Selecionar',
      Cancel: 'Cancelar',
      Add: 'Adicionar',
      Name: 'Nome',
      Host: 'Host',
      Remove: 'Remover',
      Close: 'Fechar',
      Terminal: 'Terminal',
      'Debug Info': 'Debug',
      FPS: 'FPS',
      Ping: 'Ping',
      Online: 'Online',
      Offline: 'Offline',
      Unknown: 'Desconhecido',
      'Open server list': 'Abrir lista de servidores',
    },
  },
}

function normalizeLocaleName(name) {
  if (!name) return DEFAULT_LOCALE
  const lowered = String(name).toLowerCase()
  if (lowered === 'pt-br') return 'pt'
  if (lowered === 'en-us') return 'en'
  return LOCALES[lowered] ? lowered : DEFAULT_LOCALE
}

function formatTranslation(text, args) {
  if (!args?.length) return text
  let index = 0
  return String(text).replace(/%s/g, () => {
    const value = args[index]
    index += 1
    return value == null ? '' : String(value)
  })
}

export function getInstalledLocales() {
  return LOCALES
}

export function getDefaultLocale() {
  return DEFAULT_LOCALE
}

export function loadStoredLocale() {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return normalizeLocaleName(stored)
}

export function storeLocale(localeName) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, normalizeLocaleName(localeName))
}

export function translate(localeName, text, ...args) {
  const locale = LOCALES[normalizeLocaleName(localeName)] ?? LOCALES[DEFAULT_LOCALE]
  const source = locale.translation?.[text] ?? text
  return formatTranslation(source, args)
}

export function getLocaleLanguageName(localeName) {
  const locale = LOCALES[normalizeLocaleName(localeName)] ?? LOCALES[DEFAULT_LOCALE]
  return locale.languageName
}


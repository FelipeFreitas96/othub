let loginContext: any = null
let sessionKey: string | null = null
let authenticatorToken: string | null = null

export function setLoginContext(ctx: any) {
  loginContext = ctx
}

export function getLoginContext() {
  return loginContext
}

export function clearLoginContext() {
  loginContext = null
  sessionKey = null
  authenticatorToken = null
}

export function setSessionKey(key: string | null) {
  sessionKey = key
}

export function getSessionKey() {
  return sessionKey
}

export function setAuthenticatorToken(token: string | null) {
  authenticatorToken = token
}

export function getAuthenticatorToken() {
  return authenticatorToken
}

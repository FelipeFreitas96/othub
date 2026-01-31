let loginContext = null
let sessionKey = null
let authenticatorToken = null

export function setLoginContext(ctx) {
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

export function setSessionKey(key) {
  sessionKey = key
}

export function getSessionKey() {
  return sessionKey
}

export function setAuthenticatorToken(token) {
  authenticatorToken = token
}

export function getAuthenticatorToken() {
  return authenticatorToken
}


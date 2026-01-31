/**
 * Tibia Protocol Opcodes
 * Based on OTClient protocol implementation
 */

/** Client to Server - Login Protocol */
export const CLIENT_OPCODES = {
  LOGIN: 0x01, // Client sends login credentials
  ENTER_GAME: 0x0A, // Client selects character to enter game
  LOGOUT: 0x14, // Client requests logout
  PING: 0x1E, // Client ping
}

/** Server to Client - Login Protocol */
export const SERVER_OPCODES = {
  LOGIN_ERROR: 0x0A, // Server sends login error
  LOGIN_ERROR_NEW: 0x0B, // Server sends login error (new)
  LOGIN_TOKEN_SUCCESS: 0x0C, // Server sends token success
  LOGIN_TOKEN_ERROR: 0x0D, // Server sends token error
  CHARACTER_LIST: 0x64, // Server sends character list
  EXTENDED_CHARACTER_LIST: 0x65, // Server sends extended character list
  UPDATE: 0x11, // Server sends update signature
  UPDATE_NEEDED: 0x1E, // Server requests client update
  SESSION_KEY: 0x28, // Server sends session key
  MOTD: 0x14, // Message of the day
}

/** Game Protocol Opcodes (for reference) */
export const GAME_OPCODES = {
  ENTER_GAME: 0x0A, // Server confirms game entry
  GAME_ERROR: 0x14, // Server sends game error
  PING_BACK: 0x1D, // Server pong response
}

/** Login Error Codes */
export const LOGIN_ERROR_CODES = {
  INVALID_CREDENTIALS: 3,
  ACCOUNT_BANNED: 4,
  ALREADY_LOGGED_IN: 5,
  SERVER_OFFLINE: 6,
  TOO_MANY_ATTEMPTS: 7,
  AUTHENTICATOR_REQUIRED: 6,
  INVALID_TOKEN: 8,
}

/** Login Error Messages */
export const LOGIN_ERROR_MESSAGES = {
  [LOGIN_ERROR_CODES.INVALID_CREDENTIALS]: 'Invalid account number or password.',
  [LOGIN_ERROR_CODES.ACCOUNT_BANNED]: 'Your account has been banned.',
  [LOGIN_ERROR_CODES.ALREADY_LOGGED_IN]: 'You are already logged in.',
  [LOGIN_ERROR_CODES.SERVER_OFFLINE]: 'Server is currently offline.',
  [LOGIN_ERROR_CODES.TOO_MANY_ATTEMPTS]: 'Too many login attempts. Please try again later.',
  [LOGIN_ERROR_CODES.AUTHENTICATOR_REQUIRED]: 'Authenticator token required.',
  [LOGIN_ERROR_CODES.INVALID_TOKEN]: 'Invalid authenticator token.',
  CONNECTION_TIMEOUT: 'Connection timeout. Please try again.',
  CONNECTION_FAILED: 'Failed to connect to server.',
}

/**
 * Get error message from error code
 * @param {number} errorCode - Error code from server
 * @returns {string} Error message
 */
export function getErrorMessage(errorCode) {
  return LOGIN_ERROR_MESSAGES[errorCode] || 'An unknown error occurred.'
}

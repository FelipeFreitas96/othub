/**
 * EnterGame Service - Business logic for the Enter Game module
 * Handles form validation, credential management, and configuration
 */

/** Window configuration */
export const WINDOW_CONFIG = {
    title: 'Enter Game',
    width: 280,
    height: 302,
}

/** Form field labels */
export const LABELS = {
    accountName: 'Acc Name:',
    password: 'Password:',
    rememberPassword: 'Remember password',
    forgotPassword: 'Forgot password and/or email',
    server: 'Server',
    clientVersion: 'Client Version',
    port: 'Port',
    autoLogin: 'Auto login',
    httpLogin: 'Enable HTTP login',
}

/** Button labels */
export const BUTTONS = {
    login: 'Login',
    createAccount: 'Create New Account',
}

/** Client version options */
export const CLIENT_VERSIONS = [
    { value: '760', label: '7.60' },
    { value: '860', label: '8.60' },
    { value: '1098', label: '10.98' },
    { value: '1281', label: '12.81' },
    { value: '1412', label: '14.12' },
]

/** Default server configuration */
export const DEFAULT_SERVER = {
    host: 'blazera.net',
    port: '7171',
    clientVersion: '860',
}

/**
 * Validates login credentials
 * @param {string} account - Account name
 * @param {string} password - Password
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateCredentials(account, password) {
    if (!account?.trim()) {
        return { valid: false, error: 'Informe o nome da conta.' }
    }
    if (!password?.trim()) {
        return { valid: false, error: 'Informe a senha.' }
    }
    return { valid: true }
}

/**
 * Builds credentials object for login
 * @param {Object} formData - Form data
 * @returns {Object} Credentials object
 */
export function buildCredentials(formData) {
    return {
        account: formData.account.trim(),
        password: formData.password,
        server: formData.server,
        port: parseInt(formData.port, 10) || 7171,
        clientVersion: formData.clientVersion,
    }
}

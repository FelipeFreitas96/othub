import { useState } from 'react'
import { WINDOW_CONFIG, LABELS, BUTTONS, CLIENT_VERSIONS, DEFAULT_SERVER, validateCredentials, buildCredentials } from '../service/enterGameService'

/**
 * EnterGameWindow - UI component for the Enter Game window
 * Adapted from modules/client_entergame/entergame.otui
 * MainWindow "Enter Game", size 280x302
 */
export default function EnterGameWindow({ onLogin, onLoginSuccess }) {
  const [account, setAccount] = useState('poporai')
  const [password, setPassword] = useState('AhW3RDwl')
  const [server, setServer] = useState(DEFAULT_SERVER.host)
  const [port, setPort] = useState(DEFAULT_SERVER.port)
  const [clientVersion, setClientVersion] = useState(DEFAULT_SERVER.clientVersion)
  const [rememberPassword, setRememberPassword] = useState(false)
  const [httpLogin, setHttpLogin] = useState(true)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    // Validate credentials
    const validation = validateCredentials(account, password)
    if (!validation.valid) {
      setError(validation.error)
      return
    }

    // Build credentials object
    const credentials = buildCredentials({
      account,
      password,
      server,
      port,
      clientVersion,
    })

    setLoading(true)
    try {
      const result = await onLogin?.(credentials)
      if (result?.ok) {
        onLoginSuccess?.(result.characters ?? [], credentials.clientVersion)
      } else if (result?.message) {
        setError(result.message)
      }
    } catch (_) {
      setError('Connection failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="relative z-10 w-[280px] rounded border-2 border-ot-border bg-ot-panel shadow-xl"
      role="dialog"
      aria-labelledby="entergame-title"
    >
      {/* Title */}
      <div
        id="entergame-title"
        className="px-3 py-2 border-b border-ot-border text-ot-text-bright text-sm font-verdana"
      >
        {WINDOW_CONFIG.title}
      </div>

      <form onSubmit={handleSubmit} className="p-3 space-y-2 text-[11px]">
        {/* Account Name */}
        <div className="flex items-center gap-2">
          <label htmlFor="account" className="w-20 text-ot-text/80 shrink-0">
            {LABELS.accountName}
          </label>
          <input
            id="account"
            type="text"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            className="flex-1 min-w-0 px-2 py-1 bg-ot-dark border border-ot-border rounded text-ot-text placeholder-ot-text/50 focus:border-ot-border-light focus:outline-none"
            placeholder="Conta"
            autoComplete="username"
          />
        </div>

        {/* Password */}
        <div className="flex items-center gap-2 mt-2.5">
          <label htmlFor="password" className="w-20 text-ot-text/80 shrink-0">
            {LABELS.password}
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex-1 min-w-0 px-2 py-1 bg-ot-dark border border-ot-border rounded text-ot-text placeholder-ot-text/50 focus:border-ot-border-light focus:outline-none"
            placeholder="Senha"
            autoComplete="current-password"
          />
        </div>

        {/* Remember password */}
        <label className="flex items-center gap-2 mt-2.5 text-ot-text/80 cursor-pointer">
          <input
            type="checkbox"
            checked={rememberPassword}
            onChange={(e) => setRememberPassword(e.target.checked)}
            className="rounded border-ot-border bg-ot-dark text-ot-border-light focus:ring-ot-border"
          />
          <span>{LABELS.rememberPassword}</span>
        </label>

        {/* Forgot password link */}
        <button
          type="button"
          className="text-ot-text/80 underline hover:text-ot-text text-left mt-1"
        >
          {LABELS.forgotPassword}
        </button>

        <div className="h-px bg-ot-border my-2" />

        {/* Server */}
        <div className="flex items-center gap-2 mt-2">
          <span className="w-14 text-ot-text/80 shrink-0">{LABELS.server}</span>
          <input
            type="text"
            value={server}
            onChange={(e) => setServer(e.target.value)}
            placeholder="Host"
            title="Endereço do servidor"
            className="flex-1 min-w-0 px-2 py-1 bg-ot-dark border border-ot-border rounded text-ot-text focus:border-ot-border-light focus:outline-none"
          />
          <button
            type="button"
            title="Lista de servidores"
            className="w-[17px] h-[17px] border border-ot-border rounded hover:bg-ot-hover shrink-0 flex items-center justify-center text-[10px]"
          >
            ⋮
          </button>
        </div>

        {/* Client Version + Port */}
        <div className="flex gap-2 mt-2">
          <div className="flex-1">
            <div className="text-ot-text/80 mb-0.5">{LABELS.clientVersion}</div>
            <select
              value={clientVersion}
              onChange={(e) => setClientVersion(e.target.value)}
              className="w-full px-2 py-1 bg-ot-dark border border-ot-border rounded text-ot-text focus:border-ot-border-light focus:outline-none"
            >
              {CLIENT_VERSIONS.map((version) => (
                <option key={version.value} value={version.value}>
                  {version.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <div className="text-ot-text/80 mb-0.5">{LABELS.port}</div>
            <input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="w-full px-2 py-1 bg-ot-dark border border-ot-border rounded text-ot-text focus:border-ot-border-light focus:outline-none"
            />
          </div>
        </div>

        {/* Auto login */}
        <label className="flex items-center gap-2 mt-2 text-ot-text/80 cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-ot-border bg-ot-dark text-ot-border-light focus:ring-ot-border"
          />
          <span>{LABELS.autoLogin}</span>
        </label>

        {/* Enable HTTP login */}
        <label className="flex items-center gap-2 mt-0.5 text-ot-text/80 cursor-pointer">
          <input
            type="checkbox"
            checked={httpLogin}
            onChange={(e) => setHttpLogin(e.target.checked)}
            className="rounded border-ot-border bg-ot-dark text-ot-border-light focus:ring-ot-border"
          />
          <span>{LABELS.httpLogin}</span>
        </label>

        <div className="h-px bg-ot-border my-2" />

        {/* Buttons: Login (right) + Create New Account (left) */}
        <div className="flex items-center justify-between gap-2 mt-2">
          <button
            type="button"
            className="px-3 py-1.5 border border-ot-border rounded hover:bg-ot-hover text-ot-text text-[11px]"
          >
            {BUTTONS.createAccount}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-1.5 bg-ot-border-light border border-ot-border rounded hover:bg-ot-text/20 text-ot-text-bright text-[11px] font-verdana w-[86px] disabled:opacity-50"
          >
            {loading ? 'Connecting...' : BUTTONS.login}
          </button>
        </div>

        {error && (
          <p className="mt-2 text-red-400 text-[10px]" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  )
}

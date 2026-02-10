import { useState } from 'react'

/**
 * EnterGame - adaptado de modules/client_entergame/entergame.otui
 * EnterGameWindow (MainWindow) - "Enter Game", size 280x302
 * Campos: Acc Name, Password, Remember password, Server, Client Version, Port, Auto login, HTTP login
 * Botões: Login, Create New Account | Link: Forgot password
 */
export default function EnterGame({ onLogin, onLoginSuccess }) {
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [server, setServer] = useState('127.0.0.1')
  const [port, setPort] = useState('7171')
  const [clientVersion, setClientVersion] = useState('860')
  const [rememberPassword, setRememberPassword] = useState(false)
  const [httpLogin, setHttpLogin] = useState(true)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!account.trim()) {
      setError('Informe o nome da conta.')
      return
    }
    if (!password.trim()) {
      setError('Informe a senha.')
      return
    }
    const credentials = {
      account: account.trim(),
      password,
      server,
      port: parseInt(port, 10) || 7171,
      clientVersion,
    }
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
      {/* Título - EnterGameWindow !text: tr('Enter Game') */}
      <div
        id="entergame-title"
        className="px-3 py-2 border-b border-ot-border text-ot-text-bright text-sm font-verdana font-bold"
      >
        Enter Game
      </div>

      <form onSubmit={handleSubmit} className="p-3 space-y-2 text-[11px]">
        {/* Acc Name */}
        <div className="flex items-center gap-2">
          <label htmlFor="account" className="w-20 text-ot-text/80 shrink-0">
            Acc Name:
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
            Password:
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
          <span>Remember password</span>
        </label>

        {/* Forgot password link */}
        <button
          type="button"
          className="text-ot-text/80 underline hover:text-ot-text text-left mt-1"
        >
          Forgot password and/or email
        </button>

        <div className="h-px bg-ot-border my-2" />

        {/* Server */}
        <div className="flex items-center gap-2 mt-2">
          <span className="w-14 text-ot-text/80 shrink-0">Server</span>
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
            <div className="text-ot-text/80 mb-0.5">Client Version</div>
            <select
              value={clientVersion}
              onChange={(e) => setClientVersion(e.target.value)}
              className="w-full px-2 py-1 bg-ot-dark border border-ot-border rounded text-ot-text focus:border-ot-border-light focus:outline-none"
            >
              <option value="760">7.60</option>
              <option value="860">8.60</option>
              <option value="1098">10.98</option>
              <option value="1281">12.81</option>
              <option value="1412">14.12</option>
            </select>
          </div>
          <div className="flex-1">
            <div className="text-ot-text/80 mb-0.5">Port</div>
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
          <span>Auto login</span>
        </label>

        {/* Enable HTTP login */}
        <label className="flex items-center gap-2 mt-0.5 text-ot-text/80 cursor-pointer">
          <input
            type="checkbox"
            checked={httpLogin}
            onChange={(e) => setHttpLogin(e.target.checked)}
            className="rounded border-ot-border bg-ot-dark text-ot-border-light focus:ring-ot-border"
          />
          <span>Enable HTTP login</span>
        </label>

        <div className="h-px bg-ot-border my-2" />

        {/* Botões: Login (direita) + Create New Account (esquerda) */}
        <div className="flex items-center justify-between gap-2 mt-2">
          <button
            type="button"
            className="px-3 py-1.5 border border-ot-border rounded hover:bg-ot-hover text-ot-text text-[11px]"
          >
            Create New Account
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-1.5 bg-ot-border-light border border-ot-border rounded hover:bg-ot-text/20 text-ot-text-bright text-[11px] font-verdana font-bold w-[86px] disabled:opacity-50"
          >
            {loading ? 'Connecting...' : 'Login'}
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

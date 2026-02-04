/**
 * Toast de mensagem de jogo - exibição fixa (bottom center).
 */
export default function GameTextMessageToast({ message }) {
  if (!message) return null
  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 px-3 py-2 rounded bg-ot-panel border border-ot-border text-ot-text-bright text-[11px] z-[2000] shadow-lg"
      role="status"
    >
      {message}
    </div>
  )
}

/**
 * ClientBackground - cópia de modules/client_background/background.otui
 * Panel id: background - image-source: /images/background, image-fixed-ratio
 * clientVersionLabel - canto inferior direito
 * Imagens: public/images/ (mesmo path do OTClient)
 */
const IMAGE_BACKGROUND = '/images/background.png'

const CLIENT_VERSION = 'OTClient Web UI 0.0.1\nRev 1\nVite + React + Tailwind'

export default function ClientBackground() {
  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden" aria-hidden="true">
      {/* background - image-source: /images/background */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('${IMAGE_BACKGROUND}'), linear-gradient(180deg, #0a1628 0%, #1a2a4a 40%, #0d1b2a 100%)`,
          backgroundColor: '#0d1b2a',
        }}
      />
      {/* clientVersionLabel - anchors right/bottom, width 120, background #00000099 */}
      <div
        className="absolute right-0 bottom-0 w-[120px] bg-black/60 text-white text-[11px] font-verdana font-bold p-1.5 text-center leading-tight animate-in fade-in duration-[1500ms]"
        aria-label="Versão do cliente"
      >
        {CLIENT_VERSION.split('\n').map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  )
}

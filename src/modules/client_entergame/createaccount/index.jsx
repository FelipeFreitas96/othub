import MainWindow from '../../../components/MainWindow'

export default function CreateAccount({ onBack }) {
  return (
    <MainWindow title="Create Account" width={280} height={220} draggable={false}>
      <div className="p-3 text-[11px] text-ot-text/80">
        OTC create account flow placeholder.
      </div>
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-1.5 border border-ot-border rounded hover:bg-ot-hover text-ot-text text-[11px]"
        >
          Back
        </button>
      </div>
    </MainWindow>
  )
}

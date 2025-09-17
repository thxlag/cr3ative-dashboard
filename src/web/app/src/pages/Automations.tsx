export default function Automations() {
  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-100">Automations</h1>
        <p className="text-sm text-slate-400">Design trigger ? condition ? action workflows for your guild.</p>
      </header>
      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-6 text-center">
        <p className="text-sm text-slate-400">
          Drag-and-drop rule builder coming soon. You will be able to stack triggers, filters, and actions with live
          previews.
        </p>
      </div>
    </div>
  );
}

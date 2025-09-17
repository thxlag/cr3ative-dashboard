export default function Loader() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-200">
      <div className="flex flex-col items-center gap-3">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-slate-300" />
        <p className="text-sm text-slate-400">Loading dashboard…</p>
      </div>
    </div>
  );
}

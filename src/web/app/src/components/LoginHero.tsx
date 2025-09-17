export default function LoginHero() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-6 text-center text-slate-200">
      <div className="max-w-xl space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/80 px-4 py-1 text-xs uppercase tracking-wide text-slate-400">
          Cr3ative Bot Dashboard
        </div>
        <h1 className="text-4xl font-semibold">Log in to control your world</h1>
        <p className="text-base text-slate-400">
          Connect with Discord to configure modules, monitor health, and automate your community. All changes apply in
          real time.
        </p>
        <div className="flex justify-center">
          <a
            href="/auth/login"
            className="rounded-full bg-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:bg-sky-400"
          >
            Log in with Discord
          </a>
        </div>
      </div>
    </div>
  );
}

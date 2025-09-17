import type { SessionUser } from "@/types/session";

interface Props {
  user: SessionUser;
  online: boolean;
  onLogout: () => Promise<void>;
}

export default function Topbar({ user, online, onLogout }: Props) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 bg-slate-950/60 px-6 py-4">
      <div>
        <p className="text-sm text-slate-400">Signed in as</p>
        <p className="text-lg font-semibold text-slate-100">{user.global_name ?? user.username}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-900/60 px-3 py-1 text-sm">
          <span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-emerald-400" : "bg-rose-400"}`} aria-hidden />
          <span className="text-slate-300">{online ? "Bot Online" : "Bot Offline"}</span>
        </div>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="rounded-full bg-slate-800/60 px-4 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

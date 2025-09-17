import clsx from "classnames";
import type { SessionUser } from "@/types/session";
import { Button } from "@/ui";
import { Badge } from "@/ui";

type AppHeaderProps = {
  user: SessionUser;
  botOnline: boolean;
  onLogout: () => Promise<void> | void;
  onToggleNav: () => void;
  onOpenPalette?: () => void;
};

export function AppHeader({ user, botOnline, onLogout, onToggleNav, onOpenPalette }: AppHeaderProps) {
  const initials = user.username?.slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-800/60 bg-surface-900/80 px-6 py-4 shadow-panel backdrop-blur">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700/70 text-slate-300 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:hidden"
          onClick={onToggleNav}
        >
          <span className="sr-only">Toggle navigation</span>
          ?
        </button>
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Cr3ative Dashboard</h1>
          <p className="text-xs text-slate-500">Manage your bot, automations, and insights</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge tone={botOnline ? "success" : "danger"}>{botOnline ? 'Bot Online' : 'Bot Offline'}</Badge>
        <Button variant="ghost" size="sm" onClick={onOpenPalette} className="hidden sm:inline-flex">
          Search / Navigate
        </Button>
        <div className="flex items-center gap-3 rounded-full border border-slate-700/70 bg-surface-800/80 px-3 py-1.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
            {user.avatar ? (
              <img src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`} alt={user.username} className="h-full w-full rounded-full object-cover" />
            ) : (
              initials)
            }
          </div>
          <div>
            <p className="text-sm font-medium text-slate-100">{user.global_name ?? user.username}</p>
            <p className="text-xs text-slate-500">{user.username}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={onLogout}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}

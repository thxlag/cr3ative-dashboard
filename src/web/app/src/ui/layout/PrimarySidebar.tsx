import { Fragment } from "react";
import { NavLink } from "react-router-dom";
import clsx from "classnames";
import type { AdminGuild } from "@/types/session";

export type NavigationItem = {
  label: string;
  to: string;
  icon?: React.ReactNode;
};

export type SidebarProps = {
  navigation: NavigationItem[];
  guildNavigation: NavigationItem[];
  guilds: AdminGuild[];
  activeGuildId?: string;
  onSelectGuild: (guildId: string) => void;
  onClose?: () => void;
};

export function PrimarySidebar({ navigation, guildNavigation, guilds, activeGuildId, onSelectGuild, onClose }: SidebarProps) {
  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    clsx(
      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-slate-800/40",
      isActive ? "bg-slate-800/70 text-slate-100" : "text-slate-400"
    );

  return (
    <aside className="flex h-full w-full flex-col gap-8 overflow-y-auto border-r border-slate-800/60 bg-surface-900/80 p-6 shadow-panel backdrop-blur lg:w-72">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Navigation</p>
        <nav className="mt-3 space-y-1">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClasses} onClick={onClose} end={item.to === "/"}>
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Servers</p>
        <div className="mt-3 space-y-2">
          {guilds.length === 0 ? (
            <p className="text-xs text-slate-500">No admin guilds yet.</p>
          ) : (
            guilds.map((guild) => (
              <button
                key={guild.id}
                type="button"
                onClick={() => {
                  onSelectGuild(guild.id);
                  onClose?.();
                }}
                className={clsx(
                  "w-full rounded-xl border border-transparent px-3 py-2 text-left text-sm font-medium transition",
                  activeGuildId === guild.id
                    ? "border-accent/40 bg-slate-800/80 text-slate-100"
                    : "text-slate-400 hover:border-slate-700"
                )}
              >
                {guild.name}
              </button>
            ))
          )}
        </div>
      </div>

      {activeGuildId && guildNavigation.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Server Panels</p>
          <nav className="mt-3 space-y-1">
            {guildNavigation.map((item) => {
              const to = item.to.replace(':guildId', activeGuildId);
              return (
                <NavLink key={item.to} to={to} className={navLinkClasses} onClick={onClose}>
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>
      )}
    </aside>
  );
}

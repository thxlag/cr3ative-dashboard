import { useState } from "react";
import clsx from "classnames";
import type { ReactNode } from "react";
import type { SessionUser } from "@/types/session";
import type { NavigationItem } from "./PrimarySidebar";
import { PrimarySidebar } from "./PrimarySidebar";
import { AppHeader } from "./AppHeader";

export type DashboardShellProps = {
  user: SessionUser;
  botOnline: boolean;
  navigation: NavigationItem[];
  guildNavigation: NavigationItem[];
  guilds: SessionUser["adminGuilds"];
  activeGuildId?: string;
  onSelectGuild: (guildId: string) => void;
  onLogout: () => Promise<void> | void;
  children: ReactNode;
};

export function DashboardShell({
  user,
  botOnline,
  navigation,
  guildNavigation,
  guilds,
  activeGuildId,
  onSelectGuild,
  onLogout,
  children,
}: DashboardShellProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-surface-900 text-slate-100">
      <div className="hidden lg:flex lg:w-72 lg:flex-col">
        <PrimarySidebar
          navigation={navigation}
          guildNavigation={guildNavigation}
          guilds={guilds}
          activeGuildId={activeGuildId}
          onSelectGuild={onSelectGuild}
        />
      </div>

      {isMobileNavOpen && (
        <div className="fixed inset-0 z-30 flex lg:hidden">
          <div className="w-72 max-w-full">
            <PrimarySidebar
              navigation={navigation}
              guildNavigation={guildNavigation}
              guilds={guilds}
              activeGuildId={activeGuildId}
              onSelectGuild={onSelectGuild}
              onClose={() => setIsMobileNavOpen(false)}
            />
          </div>
          <div
            className="flex-1 bg-black/60"
            role="button"
            aria-label="Close navigation"
            tabIndex={0}
            onClick={() => setIsMobileNavOpen(false)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setIsMobileNavOpen(false);
            }}
          />
        </div>
      )}

      <div className="flex flex-1 flex-col">
        <AppHeader
          user={user}
          botOnline={botOnline}
          onLogout={onLogout}
          onToggleNav={() => setIsMobileNavOpen((prev) => !prev)}
        />
        <main className="flex-1 overflow-y-auto bg-surface-900/90 px-6 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}

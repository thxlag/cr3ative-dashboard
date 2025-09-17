import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Loader from "@/components/Loader";
import LoginHero from "@/components/LoginHero";
import Overview from "@/pages/Overview";
import Analytics from "@/pages/Analytics";
import Automations from "@/pages/Automations";
import ServerDashboard from "@/pages/ServerDashboard";
import Commands from "@/pages/Commands";
import Moderation from "@/pages/Moderation";
import Settings from "@/pages/Settings";
import { useSession } from "@/hooks/useSession";
import { useBotStatus } from "@/hooks/useBotStatus";
import { useAdminGuilds } from "@/hooks/useAdminGuilds";
import { useLiveStats } from "@/hooks/useLiveStats";
import { GuildContext } from "@/context/GuildContext";
import { DashboardShell } from "@/ui";
import type { SessionUser } from "@/types/session";

const MAIN_NAVIGATION = [
  { label: "Overview", to: "/" },
  { label: "Analytics", to: "/analytics" },
  { label: "Automations", to: "/automations" },
];

const GUILD_NAVIGATION = [
  { label: "Server Dashboard", to: "/server/:guildId" },
  { label: "Commands", to: "/server/:guildId/commands" },
  { label: "Moderation", to: "/server/:guildId/moderation" },
  { label: "Settings", to: "/server/:guildId/settings" },
];

function DashboardApp({ user }: { user: SessionUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const botStatus = useBotStatus();
  const guildsQuery = useAdminGuilds();
  const guilds = useMemo(() => guildsQuery.data ?? user.adminGuilds, [guildsQuery.data, user.adminGuilds]);
  const [activeGuildId, setActiveGuildId] = useState<string | undefined>(guilds[0]?.id);

  useLiveStats(true);

  useEffect(() => {
    const match = location.pathname.match(/^\/server\/(\d+)/);
    if (match) {
      setActiveGuildId(match[1]);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!activeGuildId && guilds.length > 0) {
      setActiveGuildId(guilds[0].id);
    }
  }, [activeGuildId, guilds]);

  const isBotOnline = botStatus.data?.status === "ok";

  const handleSelectGuild = (guildId: string) => {
    setActiveGuildId(guildId);
    navigate(`/server/${guildId}`);
  };

  const handleLogout = async () => {
    await fetch("/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/";
  };

  const hasGuilds = guilds.length > 0;

  if (guildsQuery.isLoading && !hasGuilds) {
    return <Loader />;
  }

  if (guildsQuery.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface-900 text-center text-slate-200">
        <h1 className="text-2xl font-semibold">Dashboard data unavailable</h1>
        <p className="mt-2 max-w-md text-sm text-slate-400">
          {guildsQuery.error?.message || "We could not load your guild list. Try refreshing or check the API logs."}
        </p>
      </div>
    );
  }

  return (
    <GuildContext.Provider value={{ activeGuildId, setActiveGuildId, guilds }}>
      <DashboardShell
        user={user}
        botOnline={Boolean(isBotOnline)}
        navigation={MAIN_NAVIGATION}
        guildNavigation={GUILD_NAVIGATION}
        guilds={guilds}
        activeGuildId={activeGuildId}
        onSelectGuild={handleSelectGuild}
        onLogout={handleLogout}
      >
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/automations" element={<Automations />} />
          {hasGuilds ? (
            <>
              <Route path="/server/:guildId" element={<ServerDashboard />} />
              <Route path="/server/:guildId/commands" element={<Commands />} />
              <Route path="/server/:guildId/moderation" element={<Moderation />} />
              <Route path="/server/:guildId/settings" element={<Settings />} />
            </>
          ) : null}
          <Route path="*" element={<Navigate to={hasGuilds && activeGuildId ? `/server/${activeGuildId}` : "/"} replace />} />
        </Routes>
        {!hasGuilds && (
          <section className="mt-8 rounded-2xl border border-slate-800 bg-surface-800/80 p-6 text-center">
            <h2 className="text-xl font-semibold text-slate-100">No admin guilds yet</h2>
            <p className="mt-2 text-sm text-slate-400">
              Invite the bot to a server or ensure you have the Manage Server permission to unlock guild dashboards.
            </p>
          </section>
        )}
      </DashboardShell>
    </GuildContext.Provider>
  );
}

export default function App() {
  const sessionQuery = useSession();

  if (sessionQuery.isLoading) {
    return <Loader />;
  }

  if (!sessionQuery.data?.authenticated || !sessionQuery.data.user) {
    return <LoginHero />;
  }

  return <DashboardApp user={sessionQuery.data.user} />;
}

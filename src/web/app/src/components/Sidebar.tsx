import { NavLink } from "react-router-dom";

const topLevel = [
  { to: "/", label: "Overview", exact: true },
  { to: "/analytics", label: "Analytics" },
  { to: "/automations", label: "Automations" },
];

const guildSections = [
  { to: "commands", label: "Commands" },
  { to: "moderation", label: "Moderation" },
  { to: "settings", label: "Settings" },
];

interface Props {
  guildId?: string;
  onSelectGuild: (guildId: string) => void;
  guilds: Array<{ id: string; name: string }>;
}

export default function Sidebar({ guildId, guilds, onSelectGuild }: Props) {
  return (
    <aside className="flex w-full flex-col gap-8 border-r border-slate-800/80 bg-slate-950/60 p-6 text-sm text-slate-300 lg:w-72">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Navigation</p>
        <nav className="mt-3 space-y-1">
          {topLevel.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-slate-800/40 ${
                  isActive ? "bg-slate-800/60 text-slate-100" : "text-slate-400"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Servers</p>
        <div className="mt-3 space-y-2">
          {guilds.length === 0 && <p className="text-xs text-slate-500">No admin guilds yet.</p>}
          {guilds.map((guild) => (
            <button
              key={guild.id}
              type="button"
              onClick={() => onSelectGuild(guild.id)}
              className={`w-full rounded-xl border border-transparent px-3 py-2 text-left text-sm font-medium transition hover:border-slate-700 hover:bg-slate-800/40 ${
                guildId === guild.id ? "border-slate-700 bg-slate-800/60 text-slate-100" : "text-slate-400"
              }`}
            >
              {guild.name}
            </button>
          ))}
        </div>
      </div>

      {guildId ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Server Panels</p>
          <nav className="mt-3 space-y-1">
            {guildSections.map((section) => (
              <NavLink
                key={section.to}
                to={`/server/${guildId}/${section.to}`}
                className={({ isActive }) =>
                  `flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-slate-800/40 ${
                    isActive ? "bg-slate-800/60 text-slate-100" : "text-slate-400"
                  }`
                }
              >
                {section.label}
              </NavLink>
            ))}
          </nav>
        </div>
      ) : null}
    </aside>
  );
}

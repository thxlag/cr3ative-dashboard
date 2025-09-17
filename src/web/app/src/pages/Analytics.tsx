import Loader from "@/components/Loader";
import { useGuildContext } from "@/context/GuildContext";
import { useGuildInsights } from "@/hooks/useGuildInsights";

export default function Analytics() {
  const { activeGuildId, guilds } = useGuildContext();
  const guildName = guilds.find((g) => g.id === activeGuildId)?.name ?? "";
  const insightsQuery = useGuildInsights(activeGuildId);

  if (!activeGuildId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-100">Analytics</h1>
        <p className="text-sm text-slate-400">Select a server from the sidebar to view engagement insights.</p>
      </div>
    );
  }

  if (insightsQuery.isLoading && !insightsQuery.data) {
    return <Loader />;
  }

  if (insightsQuery.isError) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-100">Analytics</h1>
        <p className="text-sm text-slate-400">Unable to load analytics for this guild.</p>
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {insightsQuery.error?.message}
        </div>
      </div>
    );
  }

  const data = insightsQuery.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-100">Analytics</h1>
        <p className="text-sm text-slate-400">Engagement and growth signals for {guildName || `guild ${activeGuildId}`}.</p>
      </header>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Top Community Champions (7d)</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800/80 text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">User ID</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Messages</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Commands</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Sentiment</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Replies</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {data?.superUsers.length ? (
                data.superUsers.map((user) => (
                  <tr key={user.userId}>
                    <td className="px-4 py-3 font-medium text-slate-100">{user.userId}</td>
                    <td className="px-4 py-3 text-right">{user.messages.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{user.commandUses.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{user.sentimentAvg}</td>
                    <td className="px-4 py-3 text-right">{user.replies.toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-5 text-center text-xs text-slate-500" colSpan={5}>
                    Not enough data yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Channel Heatmap (7d)</h2>
          <ul className="mt-3 space-y-2 text-xs text-slate-400">
            {data?.channelHeatmap.length ? (
              data.channelHeatmap.slice(0, 20).map((bucket) => (
                <li key={`${bucket.channelId}-${bucket.hour}`} className="flex items-center justify-between">
                  <span>#{bucket.channelName} · {bucket.hour}:00</span>
                  <span className="text-slate-200">{bucket.messages}</span>
                </li>
              ))
            ) : (
              <li>No channel activity recorded yet.</li>
            )}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Join vs Leave (30d)</h2>
          <ul className="mt-3 space-y-2 text-xs text-slate-400">
            {data?.joinLeave.length ? (
              data.joinLeave.map((row) => (
                <li key={row.date} className="flex items-center justify-between">
                  <span>{row.date}</span>
                  <span className="text-slate-200">+{row.joins} / -{row.leaves}</span>
                </li>
              ))
            ) : (
              <li>No member movement recorded yet.</li>
            )}
          </ul>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Top Commands (7d)</h2>
          <ul className="mt-3 space-y-2 text-xs text-slate-400">
            {data?.commandUsage.length ? (
              data.commandUsage.map((row) => (
                <li key={row.commandName} className="flex items-center justify-between">
                  <span>/{row.commandName}</span>
                  <span className="text-slate-200">{row.uses.toLocaleString()} uses</span>
                </li>
              ))
            ) : (
              <li>No command usage logged yet.</li>
            )}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Command Errors (7d)</h2>
          <ul className="mt-3 space-y-2 text-xs text-rose-300">
            {data?.commandErrors.length ? (
              data.commandErrors.map((row) => (
                <li key={row.commandName ?? 'unknown'} className="flex items-center justify-between">
                  <span>{row.commandName ?? 'unknown command'}</span>
                  <span>
                    {row.errors.toLocaleString()} errors · {row.lastSeen ? new Date(row.lastSeen).toLocaleString() : 'unknown'}
                  </span>
                </li>
              ))
            ) : (
              <li className="text-slate-500">No recent command errors logged.</li>
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}

import { Skeleton, Card, SectionHeading, StatTile } from "@/ui";
import { useGlobalStats } from "@/hooks/useGlobalStats";

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Overview">Global Health</SectionHeading>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Skeleton key={idx} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <Skeleton key={idx} className="h-56 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export default function Overview() {
  const statsQuery = useGlobalStats();

  if (statsQuery.isLoading && !statsQuery.data) {
    return <OverviewSkeleton />;
  }

  if (statsQuery.isError) {
    return (
      <div className="space-y-4">
        <SectionHeading eyebrow="Overview">Global Health</SectionHeading>
        <Card className="border-danger/40 bg-danger/10 text-danger">
          {statsQuery.error?.message || 'Unable to load global stats. Try again shortly.'}
        </Card>
      </div>
    );
  }

  const stats = statsQuery.data;
  const statTiles = [
    { label: 'Servers', value: stats.servers.toLocaleString() },
    { label: 'Users', value: stats.users.toLocaleString() },
    { label: 'Commands Today', value: stats.commandsToday.toLocaleString() },
    { label: 'Gateway Latency', value: stats.latency ? `${stats.latency} ms` : '--' },
  ];

  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Overview">Global Health</SectionHeading>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statTiles.map((tile) => (
          <StatTile key={tile.label} label={tile.label} value={tile.value} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Top Commands (24h)" subtitle="Command usage across all guilds">
          <ul className="space-y-2 text-sm text-slate-300">
            {stats.topCommands.length ? (
              stats.topCommands.map((cmd) => (
                <li key={cmd.name} className="flex items-center justify-between rounded-xl bg-slate-800/40 px-3 py-2">
                  <span className="font-medium text-slate-100">/{cmd.name}</span>
                  <span className="text-slate-400">{cmd.count.toLocaleString()} uses</span>
                </li>
              ))
            ) : (
              <li className="text-xs text-slate-500">No command usage recorded in the last 24 hours.</li>
            )}
          </ul>
        </Card>
        <Card title="Economy Snapshot" subtitle="Quick glance at wallet + bank totals">
          <p className="text-sm text-slate-400">
            Wallet and bank breakdowns live inside each guild dashboard. Select a server to inspect economy distribution, richest users, and transaction trends.
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Member Growth" subtitle="Past 7 days">
          <ul className="space-y-1 text-xs text-slate-400">
            {stats.analytics.memberGrowth.length ? (
              stats.analytics.memberGrowth.map((point) => (
                <li key={point.label} className="flex items-center justify-between">
                  <span>{point.label}</span>
                  <span className="font-semibold text-slate-200">{point.value.toLocaleString()}</span>
                </li>
              ))
            ) : (
              <li>No data yet.</li>
            )}
          </ul>
        </Card>
        <Card title="Message Activity" subtitle="Past 7 days">
          <ul className="space-y-1 text-xs text-slate-400">
            {stats.analytics.messageActivity.length ? (
              stats.analytics.messageActivity.map((point) => (
                <li key={point.label} className="flex items-center justify-between">
                  <span>{point.label}</span>
                  <span className="font-semibold text-slate-200">{point.value.toLocaleString()}</span>
                </li>
              ))
            ) : (
              <li>No data yet.</li>
            )}
          </ul>
        </Card>
        <Card title="Role Distribution" subtitle="Top roles by membership">
          <ul className="space-y-1 text-xs text-slate-400">
            {stats.analytics.roleDistribution.length ? (
              stats.analytics.roleDistribution.slice(0, 10).map((point) => (
                <li key={point.label} className="flex items-center justify-between">
                  <span>{point.label}</span>
                  <span className="font-semibold text-slate-200">{point.value.toLocaleString()}</span>
                </li>
              ))
            ) : (
              <li>No data yet.</li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}

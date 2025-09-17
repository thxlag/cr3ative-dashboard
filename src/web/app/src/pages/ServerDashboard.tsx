import { Skeleton, Card, SectionHeading, StatTile } from "@/ui";
import { useGuildContext } from "@/context/GuildContext";
import { useGuildSummary } from "@/hooks/useGuildSummary";

type SummaryRow = {
  title: string;
  value: string;
  subtitle?: string;
};

function ServerDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Server Dashboard">Loading</SectionHeading>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Skeleton key={idx} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <Skeleton key={idx} className="h-64 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, idx) => (
          <Skeleton key={idx} className="h-56 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export default function ServerDashboard() {
  const { activeGuildId, guilds } = useGuildContext();
  const summaryQuery = useGuildSummary(activeGuildId);

  if (!activeGuildId) {
    return (
      <div className="space-y-4">
        <SectionHeading eyebrow="Server Dashboard">Pick a Server</SectionHeading>
        <Card>Select a server from the navigation to view live insights.</Card>
      </div>
    );
  }

  if (summaryQuery.isLoading && !summaryQuery.data) {
    return <ServerDashboardSkeleton />;
  }

  if (summaryQuery.isError) {
    const guildName = guilds.find((g) => g.id === activeGuildId)?.name ?? `Guild ${activeGuildId}`;
    return (
      <div className="space-y-4">
        <SectionHeading eyebrow="Server Dashboard">{guildName}</SectionHeading>
        <Card className="border-danger/40 bg-danger/10 text-danger">
          {summaryQuery.error?.message || 'Unable to load guild analytics.'}
        </Card>
      </div>
    );
  }

  const summary = summaryQuery.data;
  const headlineCards: SummaryRow[] = [
    { title: 'Members', value: summary.memberCount.toLocaleString(), subtitle: 'Approximate member count' },
    { title: 'Economy Total', value: summary.economy.total.toLocaleString(), subtitle: 'Wallet + bank' },
    { title: 'Moderation Cases', value: summary.moderation.total.toLocaleString(), subtitle: 'All-time actions' },
    { title: 'Unique Pokémon', value: summary.pokemon.unique.toLocaleString(), subtitle: 'Guild Pokédex' },
  ];

  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Server Dashboard">{summary.name}</SectionHeading>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {headlineCards.map((card) => (
          <StatTile key={card.title} label={card.title} value={card.value} delta={card.subtitle} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Economy Breakdown" subtitle="Wallet vs bank holdings">
          <dl className="grid grid-cols-2 gap-3 text-sm text-slate-300">
            <div>
              <dt className="text-slate-500">Wallet</dt>
              <dd className="text-lg font-semibold text-slate-100">{summary.economy.wallet.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Bank</dt>
              <dd className="text-lg font-semibold text-slate-100">{summary.economy.bank.toLocaleString()}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500">Top Transactions (24h)</dt>
              <dd className="mt-2 space-y-1">
                {summary.economy.topTransactions.length ? (
                  summary.economy.topTransactions.map((txn) => (
                    <div key={txn.name} className="flex items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2 text-xs">
                      <span className="font-medium text-slate-200">{txn.name}</span>
                      <span>{txn.count.toLocaleString()} uses</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">No transactions recorded in the last 24 hours.</p>
                )}
              </dd>
            </div>
          </dl>
        </Card>
        <Card title="Active Jobs" subtitle="Top roles in the economy">
          <ul className="space-y-2 text-sm text-slate-300">
            {summary.jobs.length ? (
              summary.jobs.slice(0, 5).map((job) => (
                <li key={job.job_name} className="flex items-center justify-between">
                  <span>{job.job_name}</span>
                  <span className="text-slate-400">{job.workers.toLocaleString()} workers</span>
                </li>
              ))
            ) : (
              <li className="text-xs text-slate-500">No job data yet.</li>
            )}
          </ul>
        </Card>
        <Card title="Server Structure" subtitle="Most active channels and roles">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Text Channels</h3>
              <ul className="mt-2 space-y-1 text-xs text-slate-400">
                {summary.channels.length ? (
                  summary.channels.slice(0, 6).map((channel) => (
                    <li key={channel.id} className="flex items-center justify-between rounded-lg bg-slate-800/30 px-3 py-2">
                      <span>#{channel.name}</span>
                      <span className="text-slate-600">{channel.id}</span>
                    </li>
                  ))
                ) : (
                  <li>No channels returned.</li>
                )}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Roles</h3>
              <ul className="mt-2 space-y-1 text-xs text-slate-400">
                {summary.roles.length ? (
                  summary.roles.slice(0, 6).map((role) => (
                    <li key={role.id} className="flex items-center justify-between rounded-lg bg-slate-800/30 px-3 py-2">
                      <span>{role.name}</span>
                      <span className="text-slate-600">{role.position}</span>
                    </li>
                  ))
                ) : (
                  <li>No roles returned.</li>
                )}
              </ul>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Latest Moderation Actions" subtitle="10 most recent cases">
          <ul className="space-y-2 text-xs text-slate-400">
            {summary.moderation.lastCases.length ? (
              summary.moderation.lastCases.map((c) => (
                <li key={c.case_id} className="rounded-xl bg-slate-800/40 px-3 py-3">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="font-semibold text-slate-100">{c.action.toUpperCase()}</span>
                    <span>{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 text-slate-400">
                    Target: <span className="text-slate-200">{c.target_id}</span> · Moderator: <span className="text-slate-200">{c.moderator_id}</span>
                  </div>
                  <p className="mt-1 text-slate-300">{c.reason || 'No reason provided'}</p>
                </li>
              ))
            ) : (
              <li>No moderation cases logged.</li>
            )}
          </ul>
        </Card>
        <Card title="Recent Pokémon Captures" subtitle="Latest 5 catches">
          <ul className="space-y-2 text-xs text-slate-400">
            {summary.pokemon.recent.length ? (
              summary.pokemon.recent.map((capture) => (
                <li key={`${capture.user_id}-${capture.captured_at}`} className="rounded-xl bg-slate-800/40 px-3 py-3">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="font-semibold text-slate-100">{capture.pokemon_display}</span>
                    <span>{new Date(capture.captured_at).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-slate-300">Captured by <span className="text-slate-200">{capture.user_id}</span></p>
                </li>
              ))
            ) : (
              <li>No captures recorded yet.</li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}

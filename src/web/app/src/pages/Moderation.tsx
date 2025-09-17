import { Skeleton, Card, SectionHeading, Badge } from "@/ui";
import { useParams } from "react-router-dom";
import { useGuildContext } from "@/context/GuildContext";
import { useGuildModLogs } from "@/hooks/useGuildModLogs";

function ModerationSkeleton() {
  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Moderation">Loading</SectionHeading>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

export default function Moderation() {
  const { guildId } = useParams();
  const { activeGuildId, guilds } = useGuildContext();
  const effectiveGuildId = guildId ?? activeGuildId;
  const guildName = guilds.find((g) => g.id === effectiveGuildId)?.name ?? "";
  const logsQuery = useGuildModLogs(effectiveGuildId);

  if (!effectiveGuildId) {
    return (
      <div className="space-y-4">
        <SectionHeading eyebrow="Moderation">Select a server</SectionHeading>
        <Card>Pick a guild to review moderation logs.</Card>
      </div>
    );
  }

  if (logsQuery.isLoading && !logsQuery.data) {
    return <ModerationSkeleton />;
  }

  if (logsQuery.isError) {
    return (
      <div className="space-y-4">
        <SectionHeading eyebrow="Moderation">{guildName}</SectionHeading>
        <Card className="border-danger/40 bg-danger/10 text-danger">
          {logsQuery.error?.message || 'Unable to fetch moderation logs.'}
        </Card>
      </div>
    );
  }

  const logs = logsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Moderation">Moderation Log</SectionHeading>
      <Card title={`Recent Cases (${logs.length})`} subtitle="Latest 25 moderation actions">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800/80 text-sm">
            <thead className="bg-slate-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Case</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Moderator</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Reason</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {logs.length ? (
                logs.map((log) => (
                  <tr key={log.caseId}>
                    <td className="px-4 py-3 text-slate-100">{log.caseId}</td>
                    <td className="px-4 py-3">
                      <Badge tone={log.action === 'BAN' ? 'danger' : 'info'}>{log.action}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{log.user}</td>
                    <td className="px-4 py-3 text-slate-300">{log.moderator}</td>
                    <td className="px-4 py-3 text-slate-400">{log.reason}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-xs text-slate-500">
                    No moderation actions recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

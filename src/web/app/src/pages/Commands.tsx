import { Skeleton, Card, SectionHeading, Button, Badge } from "@/ui";
import { useParams } from "react-router-dom";
import { useGuildContext } from "@/context/GuildContext";
import { useGuildCommands, useCommandToggleMutation } from "@/hooks/useGuildCommands";

function CommandsSkeleton() {
  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Commands">Loading</SectionHeading>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

export default function Commands() {
  const { guildId } = useParams();
  const { activeGuildId, guilds } = useGuildContext();
  const effectiveGuildId = guildId ?? activeGuildId;
  const guildName = guilds.find((g) => g.id === effectiveGuildId)?.name ?? "";
  const commandsQuery = useGuildCommands(effectiveGuildId);
  const toggleMutation = effectiveGuildId ? useCommandToggleMutation(effectiveGuildId) : null;

  if (!effectiveGuildId) {
    return (
      <div className="space-y-4">
        <SectionHeading eyebrow="Commands">Select a server</SectionHeading>
        <Card>Select a guild to manage command access.</Card>
      </div>
    );
  }

  if (commandsQuery.isLoading && !commandsQuery.data) {
    return <CommandsSkeleton />;
  }

  if (commandsQuery.isError) {
    return (
      <div className="space-y-4">
        <SectionHeading eyebrow="Commands">{guildName}</SectionHeading>
        <Card className="border-danger/40 bg-danger/10 text-danger">
          {commandsQuery.error?.message || 'Unable to load command toggles.'}
        </Card>
      </div>
    );
  }

  const rows = commandsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Commands">Manage Command Access</SectionHeading>
      <Card
        title={`Registered Commands (${rows.length})`}
        subtitle="Toggle commands on or off per guild. Changes apply instantly."
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800/80 text-sm">
            <thead className="bg-slate-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Command</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Category</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-slate-100">{row.name}</td>
                  <td className="px-4 py-3 text-slate-400">{row.category}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant={row.enabled ? 'secondary' : 'ghost'}
                      size="sm"
                      loading={toggleMutation?.isPending}
                      onClick={() => toggleMutation?.mutate({ id: row.id, enabled: !row.enabled })}
                    >
                      {row.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Badge tone={row.enabled ? 'success' : 'danger'} className="ml-3">
                      {row.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

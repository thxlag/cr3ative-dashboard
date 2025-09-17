import { Skeleton, Card, SectionHeading, Badge } from "@/ui";
import { useParams } from "react-router-dom";
import { useGuildContext } from "@/context/GuildContext";
import { useGuildSettings } from "@/hooks/useGuildSettings";

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Settings">Loading</SectionHeading>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, idx) => (
          <Skeleton key={idx} className="h-52 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  );
}

export default function Settings() {
  const { guildId } = useParams();
  const { activeGuildId, guilds } = useGuildContext();
  const effectiveGuildId = guildId ?? activeGuildId;
  const guildName = guilds.find((g) => g.id === effectiveGuildId)?.name ?? "";
  const settingsQuery = useGuildSettings(effectiveGuildId);

  if (!effectiveGuildId) {
    return (
      <div className="space-y-4">
        <SectionHeading eyebrow="Settings">Select a server</SectionHeading>
        <Card>Pick a guild to review bot configuration.</Card>
      </div>
    );
  }

  if (settingsQuery.isLoading && !settingsQuery.data) {
    return <SettingsSkeleton />;
  }

  if (settingsQuery.isError) {
    return (
      <div className="space-y-4">
        <SectionHeading eyebrow="Settings">{guildName}</SectionHeading>
        <Card className="border-danger/40 bg-danger/10 text-danger">
          {settingsQuery.error?.message || 'Unable to load guild settings.'}
        </Card>
      </div>
    );
  }

  const settings = settingsQuery.data;

  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Settings">Live Configuration</SectionHeading>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Bot Presence" subtitle="Slash commands and prefix">
          <dl className="space-y-3 text-sm text-slate-300">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Slash Commands</dt>
              <Badge tone={settings.slashCommands ? 'success' : 'danger'}>
                {settings.slashCommands ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div>
              <dt className="text-slate-500">Prefix</dt>
              <dd className="mt-1 text-lg font-semibold text-slate-100">{settings.prefix}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Welcome Messages" subtitle="Greeting new members">
          <dl className="space-y-3 text-sm text-slate-300">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Status</dt>
              <Badge tone={settings.welcomeEnabled ? 'success' : 'danger'}>
                {settings.welcomeEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div>
              <dt className="text-slate-500">Channel</dt>
              <dd className="mt-1 text-slate-200">{settings.welcomeChannelId || 'Not configured'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Message Template</dt>
              <dd className="mt-2 rounded-xl bg-slate-800/40 px-3 py-2 text-xs text-slate-200">{settings.welcomeMessage}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Leave Messages" subtitle="Farewell messages">
          <dl className="space-y-3 text-sm text-slate-300">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Status</dt>
              <Badge tone={settings.leaveEnabled ? 'success' : 'danger'}>
                {settings.leaveEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div>
              <dt className="text-slate-500">Channel</dt>
              <dd className="mt-1 text-slate-200">{settings.leaveChannelId || 'Not configured'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Message Template</dt>
              <dd className="mt-2 rounded-xl bg-slate-800/40 px-3 py-2 text-xs text-slate-200">{settings.leaveMessage}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Role Permissions" subtitle="Roles that unlock bot administration">
          <dl className="space-y-3 text-sm text-slate-300">
            <div>
              <dt className="text-slate-500">Admin Role</dt>
              <dd className="mt-1 text-slate-200">{settings.adminRoleId || 'Not set'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Moderator Role</dt>
              <dd className="mt-1 text-slate-200">{settings.modRoleId || 'Not set'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">DJ Role</dt>
              <dd className="mt-1 text-slate-200">{settings.djRoleId || 'Not set'}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card title="Coming Soon" subtitle="Inline editing & review">
        <p className="text-sm text-slate-400">
          Editable controls will allow you to update prefixes, welcome flows, and permissions with validation and preview before publishing. For now, values reflect the live configuration from the bot database.
        </p>
      </Card>
    </div>
  );
}

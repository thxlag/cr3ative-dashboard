export type SeriesPoint = {
  label: string;
  value: number;
};

export type TopCommand = {
  name: string;
  count: number;
};

export type GlobalStats = {
  servers: number;
  users: number;
  latency: number;
  commandsToday: number;
  topCommands: TopCommand[];
  analytics: {
    memberGrowth: SeriesPoint[];
    messageActivity: SeriesPoint[];
    roleDistribution: SeriesPoint[];
  };
};

export type EconomySummary = {
  users: number;
  wallet: number;
  bank: number;
  total: number;
  topTransactions: TopCommand[];
  richestUsers: Array<{ id: string; wallet: number }>;
};

export type PokemonCapture = {
  pokemon_display: string;
  user_id: string;
  captured_at: number;
};

export type PokemonSummary = {
  total: number;
  unique: number;
  recent: PokemonCapture[];
};

export type ModerationSummary = {
  total: number;
  lastCases: Array<{
    case_id: string;
    action: string;
    target_id: string;
    moderator_id: string;
    reason: string | null;
    created_at: number;
  }>;
  byAction: Array<{ action: string; uses: number }>;
};

export type JobSummary = {
  job_name: string;
  workers: number;
};

export type GuildChannel = {
  id: string;
  name: string;
  type: string;
};

export type GuildRole = {
  id: string;
  name: string;
  position: number;
};

export type GuildSummary = {
  id: string;
  name: string;
  iconUrl: string | null;
  memberCount: number;
  economy: EconomySummary;
  pokemon: PokemonSummary;
  moderation: ModerationSummary;
  jobs: JobSummary[];
  channels: GuildChannel[];
  roles: GuildRole[];
};

export type CommandToggle = {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
};

export type ModLogEntry = {
  caseId: string;
  action: string;
  user: string;
  moderator: string;
  reason: string;
  timestamp: number;
};

export type GuildSettings = {
  prefix: string;
  slashCommands: boolean;
  welcomeChannelId: string;
  welcomeMessage: string;
  welcomeEnabled: boolean;
  leaveChannelId: string;
  leaveMessage: string;
  leaveEnabled: boolean;
  adminRoleId: string;
  modRoleId: string;
  djRoleId: string;
};

export type SuperUserInsight = {
  userId: string;
  messages: number;
  commandUses: number;
  sentimentAvg: string;
  replies: number;
  words: number;
};

export type CommandUsageRow = {
  commandName: string;
  uses: number;
};

export type ChannelHeatmapBucket = {
  channelId: string;
  channelName: string;
  hour: string;
  messages: number;
};

export type JoinLeaveRow = {
  date: string;
  joins: number;
  leaves: number;
};

export type CommandErrorRow = {
  commandName: string | null;
  errors: number;
  lastSeen: number;
};

export type GuildInsights = {
  superUsers: SuperUserInsight[];
  commandUsage: CommandUsageRow[];
  channelHeatmap: ChannelHeatmapBucket[];
  joinLeave: JoinLeaveRow[];
  commandErrors: CommandErrorRow[];
};

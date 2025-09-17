import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDB } from '../../lib/db.js';
import {
  DASHBOARD_GUILD_ID,
  DASHBOARD_GUILD_NAME,
  DASHBOARD_FEATURE_FLAGS,
} from '../utils/config.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  fetchGuildMeta,
  fetchGuildChannels,
  fetchGuildRoles,
  measureApiLatency,
} from '../utils/discordApi.js';

const router = Router();
const db = getDB();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commandsRoot = path.join(__dirname, '..', '..', 'commands');

// Ensure dashboard tables exist (best effort)
db.exec(`
  CREATE TABLE IF NOT EXISTS dashboard_guild_settings (
    guild_id TEXT PRIMARY KEY,
    prefix TEXT DEFAULT '!',
    slash_commands INTEGER DEFAULT 1,
    welcome_channel_id TEXT,
    welcome_message TEXT,
    welcome_enabled INTEGER DEFAULT 1,
    leave_channel_id TEXT,
    leave_message TEXT,
    leave_enabled INTEGER DEFAULT 0,
    admin_role_id TEXT,
    mod_role_id TEXT,
    dj_role_id TEXT
  );

  CREATE TABLE IF NOT EXISTS dashboard_command_settings (
    guild_id TEXT NOT NULL,
    command_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (guild_id, command_id)
  );
`);

function ensureAuthorizedGuild(guildId) {
  return String(guildId) === String(DASHBOARD_GUILD_ID);
}

function defaultGuildSettings() {
  return {
    prefix: '!',
    slashCommands: true,
    welcomeChannelId: '',
    welcomeMessage: 'Welcome {user} to {server}! ??',
    welcomeEnabled: true,
    leaveChannelId: '',
    leaveMessage: '{user} has left the server.',
    leaveEnabled: false,
    adminRoleId: '',
    modRoleId: '',
    djRoleId: '',
  };
}

function mapSettingsRow(row) {
  if (!row) return defaultGuildSettings();
  return {
    prefix: row.prefix || '!',
    slashCommands: row.slash_commands !== 0,
    welcomeChannelId: row.welcome_channel_id || '',
    welcomeMessage: row.welcome_message || 'Welcome {user} to {server}! ??',
    welcomeEnabled: row.welcome_enabled !== 0,
    leaveChannelId: row.leave_channel_id || '',
    leaveMessage: row.leave_message || '{user} has left the server.',
    leaveEnabled: row.leave_enabled !== 0,
    adminRoleId: row.admin_role_id || '',
    modRoleId: row.mod_role_id || '',
    djRoleId: row.dj_role_id || '',
  };
}

function persistSettings(guildId, updates) {
  const current = mapSettingsRow(db.prepare('SELECT * FROM dashboard_guild_settings WHERE guild_id = ?').get(guildId));
  const next = { ...current, ...updates };
  db.prepare(`
    INSERT INTO dashboard_guild_settings (
      guild_id,
      prefix,
      slash_commands,
      welcome_channel_id,
      welcome_message,
      welcome_enabled,
      leave_channel_id,
      leave_message,
      leave_enabled,
      admin_role_id,
      mod_role_id,
      dj_role_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      prefix = excluded.prefix,
      slash_commands = excluded.slash_commands,
      welcome_channel_id = excluded.welcome_channel_id,
      welcome_message = excluded.welcome_message,
      welcome_enabled = excluded.welcome_enabled,
      leave_channel_id = excluded.leave_channel_id,
      leave_message = excluded.leave_message,
      leave_enabled = excluded.leave_enabled,
      admin_role_id = excluded.admin_role_id,
      mod_role_id = excluded.mod_role_id,
      dj_role_id = excluded.dj_role_id
  `).run(
    guildId,
    next.prefix,
    next.slashCommands ? 1 : 0,
    next.welcomeChannelId,
    next.welcomeMessage,
    next.welcomeEnabled ? 1 : 0,
    next.leaveChannelId,
    next.leaveMessage,
    next.leaveEnabled ? 1 : 0,
    next.adminRoleId,
    next.modRoleId,
    next.djRoleId,
  );
  return next;
}

function loadCommandMetadata() {
  const results = [];
  if (!fs.existsSync(commandsRoot)) return results;
  const categories = fs.readdirSync(commandsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const category of categories) {
    const categoryDir = path.join(commandsRoot, category);
    const files = fs.readdirSync(categoryDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
      .map((entry) => entry.name.replace(/\.js$/, ''));

    for (const name of files) {
      results.push({
        id: `${category}:${name}`,
        name: `/${name}`,
        category,
      });
    }
  }
  return results;
}

const commandMetadataCache = loadCommandMetadata();

function buildCommandPayload(guildId) {
  const overrides = new Map(
    db.prepare('SELECT command_id, enabled FROM dashboard_command_settings WHERE guild_id = ?').all(guildId)
      .map((row) => [row.command_id, row.enabled === 1])
  );
  return commandMetadataCache.map((cmd) => ({
    id: cmd.id,
    name: cmd.name,
    category: cmd.category,
    enabled: overrides.has(cmd.id) ? overrides.get(cmd.id) : true,
  }));
}

function safeQuery(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function getEconomySummary(guildId) {
  const totals = safeQuery(
    () => db.prepare('SELECT COUNT(*) AS users, COALESCE(SUM(wallet),0) AS wallet, COALESCE(SUM(bank),0) AS bank FROM users').get(),
    { users: 0, wallet: 0, bank: 0 }
  );
  const recentTxns = safeQuery(
    () => db.prepare('SELECT type, COUNT(*) AS uses FROM txns WHERE created_at >= ? GROUP BY type ORDER BY uses DESC LIMIT 5')
      .all(Date.now() - 24 * 60 * 60 * 1000),
    []
  );
  return {
    users: totals?.users || 0,
    wallet: totals?.wallet || 0,
    bank: totals?.bank || 0,
    total: (totals?.wallet || 0) + (totals?.bank || 0),
    topTransactions: recentTxns.map((row) => ({ name: row.type, count: row.uses })),
  };
}

function getPokemonSummary(guildId) {
  const captureTotals = safeQuery(
    () => db.prepare('SELECT COUNT(*) AS total, COUNT(DISTINCT pokemon_id) AS uniqueMon FROM pokemon_captures WHERE guild_id = ?')
      .get(guildId),
    { total: 0, uniqueMon: 0 }
  );
  const recent = safeQuery(
    () => db.prepare('SELECT pokemon_display, user_id, captured_at FROM pokemon_captures WHERE guild_id = ? ORDER BY captured_at DESC LIMIT 5')
      .all(guildId),
    []
  );
  return {
    total: captureTotals?.total || 0,
    unique: captureTotals?.uniqueMon || 0,
    recent,
  };
}

function getModerationSummary(guildId) {
  const total = safeQuery(
    () => db.prepare('SELECT COUNT(*) AS total FROM mod_cases WHERE guild_id = ?').get(guildId)?.total,
    0
  );
  const lastCases = safeQuery(
    () => db.prepare('SELECT case_id, action, target_id, moderator_id, reason, created_at FROM mod_cases WHERE guild_id = ? ORDER BY created_at DESC LIMIT 10').all(guildId),
    []
  );
  const byAction = safeQuery(
    () => db.prepare('SELECT action, COUNT(*) AS uses FROM mod_cases WHERE guild_id = ? GROUP BY action').all(guildId),
    []
  );
  return { total: total || 0, lastCases, byAction };
}

function getGuildJobsSummary(guildId) {
  return safeQuery(
    () => db.prepare('SELECT jobs.name AS job_name, COUNT(user_jobs.user_id) AS workers FROM user_jobs JOIN jobs ON jobs.id = user_jobs.job_id GROUP BY user_jobs.job_id ORDER BY workers DESC').all(),
    []
  );
}

function buildMemberGrowthSeries(guildId, days = 7) {
  const series = [];
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (let i = days - 1; i >= 0; i -= 1) {
    const dayStart = new Date(now - i * dayMs);
    dayStart.setHours(0, 0, 0, 0);
    const startTs = dayStart.getTime();
    const endTs = startTs + dayMs;
    const row = safeQuery(
      () => db.prepare('SELECT COUNT(*) AS active FROM levels WHERE guild_id = ? AND last_xp_at BETWEEN ? AND ?')
        .get(guildId, startTs, endTs),
      { active: 0 }
    );
    series.push({ label: dayStart.toISOString().slice(0, 10), value: row?.active || 0 });
  }
  return series;
}

function buildMessageActivitySeries(guildId, days = 7) {
  const series = [];
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (let i = days - 1; i >= 0; i -= 1) {
    const dayStart = new Date(now - i * dayMs);
    dayStart.setHours(0, 0, 0, 0);
    const startTs = dayStart.getTime();
    const endTs = startTs + dayMs;
    const row = safeQuery(
      () => db.prepare('SELECT COUNT(*) AS actions FROM analytics_message_activity WHERE guild_id = ? AND created_at BETWEEN ? AND ?')
        .get(guildId, startTs, endTs),
      { actions: 0 }
    );
    series.push({ label: dayStart.toISOString().slice(5, 10), value: row?.actions || 0 });
  }
  return series;
}

function buildRoleDistribution(guildId) {
  return safeQuery(
    () => db.prepare('SELECT r.name AS role_name, COUNT(gr.user_id) AS members FROM guild_roles gr JOIN roles r ON r.id = gr.role_id WHERE gr.guild_id = ? GROUP BY gr.role_id ORDER BY members DESC')
      .all(guildId),
    []
  ).map((row) => ({ label: row.role_name, value: row.members }));
}

async function computeGlobalStats() {
  const economy = getEconomySummary();
  const totalServers = 1;
  const totalUsers = economy.users;
  const commandsToday = safeQuery(
    () => db.prepare('SELECT COUNT(*) AS c FROM analytics_command_usage WHERE used_at >= ?').get(Date.now() - 24 * 60 * 60 * 1000)?.c,
    0
  );
  const topCommands = safeQuery(
    () => db.prepare('SELECT command_name AS name, COUNT(*) AS uses FROM analytics_command_usage GROUP BY command_name ORDER BY uses DESC LIMIT 5').all(),
    []
  );
  const latency = await measureApiLatency().catch(() => null);
  return {
    servers: totalServers,
    users: totalUsers,
    latency: latency ?? 0,
    commandsToday,
    topCommands: topCommands.map((row) => ({ name: row.name || 'unknown', count: row.uses })),
    analytics: {
      memberGrowth: buildMemberGrowthSeries(DASHBOARD_GUILD_ID, 7),
      messageActivity: buildMessageActivitySeries(DASHBOARD_GUILD_ID, 7),
      roleDistribution: buildRoleDistribution(DASHBOARD_GUILD_ID),
    },
  };
}

router.get('/api/admin/guilds', requireAdmin, (req, res) => {
  res.json([{ id: DASHBOARD_GUILD_ID, name: DASHBOARD_GUILD_NAME }]);
});

router.get('/api/admin/guilds/:guildId', requireAdmin, async (req, res) => {
  const { guildId } = req.params;
  if (!ensureAuthorizedGuild(guildId)) {
    return res.status(403).json({ error: 'Guild not authorized' });
  }

  const economy = getEconomySummary(guildId);
  const pokemon = getPokemonSummary(guildId);
  const moderation = getModerationSummary(guildId);
  const jobs = getGuildJobsSummary(guildId);

  let guildMeta = null;
  let channels = [];
  let roles = [];

  if (DASHBOARD_FEATURE_FLAGS.allowDiscordFetch) {
    try {
      guildMeta = await fetchGuildMeta(guildId);
      channels = await fetchGuildChannels(guildId);
      roles = await fetchGuildRoles(guildId);
    } catch (error) {
      console.warn('Failed to fetch guild metadata from Discord:', error.message);
    }
  }

  const mappedChannels = channels
    .filter((ch) => ch.type === 0)
    .map((ch) => ({ id: ch.id, name: ch.name, type: 'GUILD_TEXT' }));

  const mappedRoles = roles
    .filter((role) => role.name !== '@everyone')
    .map((role) => ({ id: role.id, name: role.name, position: role.position }));

  res.json({
    id: guildMeta?.id || DASHBOARD_GUILD_ID,
    name: guildMeta?.name || DASHBOARD_GUILD_NAME,
    iconUrl: guildMeta?.icon
      ? `https://cdn.discordapp.com/icons/${guildMeta.id}/${guildMeta.icon}.png?size=128`
      : null,
    memberCount: guildMeta?.approximate_member_count || economy.users,
    economy,
    pokemon,
    moderation,
    jobs,
    channels: mappedChannels,
    roles: mappedRoles,
  });
});

router.get('/api/admin/guilds/:guildId/commands', requireAdmin, (req, res) => {
  const { guildId } = req.params;
  if (!ensureAuthorizedGuild(guildId)) {
    return res.status(403).json({ error: 'Guild not authorized' });
  }
  res.json(buildCommandPayload(guildId));
});

router.post('/api/admin/guilds/:guildId/commands', requireAdmin, (req, res) => {
  const { guildId } = req.params;
  if (!ensureAuthorizedGuild(guildId)) {
    return res.status(403).json({ error: 'Guild not authorized' });
  }

  const updates = req.body?.commands;
  if (!Array.isArray(updates)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const tx = db.transaction((rows) => {
    rows.forEach((row) => {
      db.prepare(
        'INSERT INTO dashboard_command_settings (guild_id, command_id, enabled) VALUES (?, ?, ?) ON CONFLICT(guild_id, command_id) DO UPDATE SET enabled = excluded.enabled'
      ).run(guildId, row.id, row.enabled ? 1 : 0);
    });
  });
  tx(updates);
  res.json({ success: true });
});

router.get('/api/admin/guilds/:guildId/modlogs', requireAdmin, (req, res) => {
  const { guildId } = req.params;
  if (!ensureAuthorizedGuild(guildId)) {
    return res.status(403).json({ error: 'Guild not authorized' });
  }
  const logs = safeQuery(
    () => db.prepare('SELECT * FROM mod_cases WHERE guild_id = ? ORDER BY created_at DESC LIMIT 25').all(guildId),
    []
  );
  res.json(logs.map((row) => ({
    caseId: row.case_id,
    action: row.action?.toUpperCase?.() || 'UNKNOWN',
    user: `<@${row.target_id}>`,
    moderator: `<@${row.moderator_id}>`,
    reason: row.reason || 'No reason provided',
    timestamp: row.created_at,
  })));
});

router.get('/api/admin/guilds/:guildId/settings', requireAdmin, (req, res) => {
  const { guildId } = req.params;
  if (!ensureAuthorizedGuild(guildId)) {
    return res.status(403).json({ error: 'Guild not authorized' });
  }
  res.json(mapSettingsRow(db.prepare('SELECT * FROM dashboard_guild_settings WHERE guild_id = ?').get(guildId)));
});

router.post('/api/admin/guilds/:guildId/settings/bot', requireAdmin, (req, res) => {
  const { guildId } = req.params;
  if (!ensureAuthorizedGuild(guildId)) {
    return res.status(403).json({ error: 'Guild not authorized' });
  }
  const payload = {
    prefix: req.body?.prefix || '!',
    slashCommands: req.body?.slashCommands !== false,
  };
  persistSettings(guildId, payload);
  res.json({ success: true });
});

router.post('/api/admin/guilds/:guildId/settings/welcome', requireAdmin, (req, res) => {
  const { guildId } = req.params;
  if (!ensureAuthorizedGuild(guildId)) {
    return res.status(403).json({ error: 'Guild not authorized' });
  }
  const payload = {
    welcomeChannelId: req.body?.welcomeChannelId || '',
    welcomeMessage: req.body?.welcomeMessage || 'Welcome {user} to {server}! ??',
    welcomeEnabled: req.body?.welcomeEnabled !== false,
  };
  persistSettings(guildId, payload);
  res.json({ success: true });
});

router.post('/api/admin/guilds/:guildId/settings/leave', requireAdmin, (req, res) => {
  const { guildId } = req.params;
  if (!ensureAuthorizedGuild(guildId)) {
    return res.status(403).json({ error: 'Guild not authorized' });
  }
  const payload = {
    leaveChannelId: req.body?.leaveChannelId || '',
    leaveMessage: req.body?.leaveMessage || '{user} has left the server.',
    leaveEnabled: req.body?.leaveEnabled === true,
  };
  persistSettings(guildId, payload);
  res.json({ success: true });
});

router.post('/api/admin/guilds/:guildId/settings/permissions', requireAdmin, (req, res) => {
  const { guildId } = req.params;
  if (!ensureAuthorizedGuild(guildId)) {
    return res.status(403).json({ error: 'Guild not authorized' });
  }
  const payload = {
    adminRoleId: req.body?.adminRoleId || '',
    modRoleId: req.body?.modRoleId || '',
    djRoleId: req.body?.djRoleId || '',
  };
  persistSettings(guildId, payload);
  res.json({ success: true });
});

router.get('/api/admin/guilds/:guildId/insights', requireAdmin, (req, res) => {
  const { guildId } = req.params;
  if (!ensureAuthorizedGuild(guildId)) {
    return res.status(403).json({ error: 'Guild not authorized' });
  }

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const messageStats = safeQuery(
    () => db.prepare('SELECT user_id as userId, COUNT(*) AS messages, SUM(sentiment) AS sentimentSum, SUM(reply_count) AS replies, SUM(word_count) AS words FROM analytics_message_activity WHERE guild_id = ? AND created_at >= ? GROUP BY user_id')
      .all(guildId, sevenDaysAgo),
    []
  );
  const commandStats = safeQuery(
    () => db.prepare('SELECT user_id AS userId, COUNT(*) AS uses FROM analytics_command_usage WHERE guild_id = ? AND used_at >= ? GROUP BY user_id')
      .all(guildId, sevenDaysAgo),
    []
  );
  const commandUsageTotals = safeQuery(
    () => db.prepare('SELECT command_name AS commandName, COUNT(*) AS uses FROM analytics_command_usage WHERE guild_id = ? AND used_at >= ? GROUP BY command_name ORDER BY uses DESC LIMIT 15')
      .all(guildId, sevenDaysAgo),
    []
  );
  const channelHeatmap = safeQuery(
    () => db.prepare('SELECT channel_id AS channelId, COALESCE(channel_name, "Unknown") AS channelName, strftime("%H", datetime(created_at / 1000, "unixepoch")) AS hour, COUNT(*) AS messages FROM analytics_message_activity WHERE guild_id = ? AND created_at >= ? GROUP BY channel_id, hour')
      .all(guildId, sevenDaysAgo),
    []
  );
  const joinEvents = safeQuery(
    () => db.prepare('SELECT date(datetime(event_at / 1000, "unixepoch")) AS date, SUM(CASE WHEN event_type = "join" THEN 1 ELSE 0 END) AS joins, SUM(CASE WHEN event_type = "leave" THEN 1 ELSE 0 END) AS leaves FROM analytics_member_events WHERE guild_id = ? AND event_at >= ? GROUP BY date ORDER BY date ASC')
      .all(guildId, thirtyDaysAgo),
    []
  );
  const errorSummary = safeQuery(
    () => db.prepare('SELECT command_name AS commandName, COUNT(*) AS errors, MAX(occurred_at) AS lastSeen FROM analytics_command_errors WHERE guild_id = ? AND occurred_at >= ? GROUP BY command_name ORDER BY errors DESC LIMIT 10')
      .all(guildId, sevenDaysAgo),
    []
  );

  const commandUsageMap = new Map(commandStats.map((row) => [row.userId, row.uses]));
  const superUsers = messageStats
    .map((row) => ({
      userId: row.userId,
      messages: row.messages,
      commandUses: commandUsageMap.get(row.userId) || 0,
      sentimentAvg: row.messages ? Number((row.sentimentSum || 0) / row.messages).toFixed(3) : '0.000',
      replies: row.replies || 0,
      words: row.words || 0,
    }))
    .sort((a, b) => (b.messages + b.commandUses) - (a.messages + a.commandUses))
    .slice(0, 15);

  res.json({
    superUsers,
    commandUsage: commandUsageTotals,
    channelHeatmap,
    joinLeave: joinEvents,
    commandErrors: errorSummary,
  });
});

router.get('/api/admin/summary', requireAdmin, async (req, res) => {
  try {
    const stats = getEconomySummary();
    const sanitizedUser = {
      id: req.session.user.id,
      username: req.session.user.username,
      global_name: req.session.user.global_name,
      avatar: req.session.user.avatar,
      adminGuilds: [{ id: DASHBOARD_GUILD_ID, name: DASHBOARD_GUILD_NAME }],
    };

    res.json({
      user: sanitizedUser,
      stats: {
        economy: stats,
        pokemon: getPokemonSummary(DASHBOARD_GUILD_ID),
        jobs: { activeJobs: getGuildJobsSummary(DASHBOARD_GUILD_ID).length },
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const global = await computeGlobalStats();
    res.json(global);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export async function getLiveStatsSnapshot() {
  return computeGlobalStats();
}

export default router;

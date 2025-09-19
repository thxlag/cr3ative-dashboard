
import { Router } from 'express';
import { client } from '../../index.js';
import { requireAdmin } from '../middleware/auth.js';
import { getDB } from '../../lib/db.js';
import { recordMessageActivity, recordCommandUsage, recordMemberEvent, recordCommandError } from '../../analytics/tracker.js';
import { listJobs } from '../../utils/jobs.js';

const router = Router();
const ownerId = process.env.OWNER_ID?.trim();

// --- Middleware ---

const ensureManageGuild = async (req, res, next) => {
  try {
    if (!req.session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.session.user.id === ownerId) {
      return next();
    }
    const { guildId } = req.params;
    if (!guildId) {
      return res.status(400).json({ error: 'Guild ID is required.' });
    }
    const adminGuilds = req.session.user.adminGuilds || [];
    if (!adminGuilds.some(g => g.id === guildId)) {
      return res.status(403).json({ error: 'You do not have permission to manage this guild.' });
    }
    next();
  } catch (err) {
    console.error('ensureManageGuild middleware error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// --- Helper Functions ---

function getEconomySummary() {
    const db = getDB();
    try {
        const totals = db.prepare('SELECT SUM(wallet) as totalWallet, SUM(bank) as totalBank, COUNT(*) as totalUsers FROM users').get();
        return {
            totalWallet: totals.totalWallet || 0,
            totalBank: totals.totalBank || 0,
            totalUsers: totals.totalUsers || 0,
        };
    } catch (error) {
        console.error('Error in getEconomySummary:', error);
        return { totalWallet: 0, totalBank: 0, totalUsers: 0 };
    }
}

function getPokemonSummary(guildId) {
    if (!guildId) return { totalCaptures: 0, uniqueCaptures: 0, topTrainers: [] };
    const db = getDB();
    try {
        const totalRow = db.prepare('SELECT COUNT(*) as total FROM pokemon_captures WHERE guild_id = ?').get(guildId);
        const uniqueRow = db.prepare('SELECT COUNT(DISTINCT pokemon_id) as total FROM pokemon_captures WHERE guild_id = ?').get(guildId);
        const topTrainers = db.prepare('SELECT user_id, COUNT(*) AS total FROM pokemon_captures WHERE guild_id = ? GROUP BY user_id ORDER BY total DESC LIMIT 5').all(guildId);

        return {
            totalCaptures: totalRow?.total || 0,
            uniqueCaptures: uniqueRow?.total || 0,
            topTrainers: topTrainers || []
        };
    } catch (error) {
        console.error(`Error in getPokemonSummary for guild ${guildId}:`, error);
        return { totalCaptures: 0, uniqueCaptures: 0, topTrainers: [] };
    }
}

function getAnalyticsSummary(guildId = null) {
    const db = getDB();
    const whereClause = guildId ? `WHERE guild_id = '${guildId}'` : '';
    const guildFilter = (query) => query.replace('WHERE', whereClause);

    try {
        const topCommandsQuery = guildFilter('SELECT command_name as name, COUNT(*) as count FROM analytics_command_usage WHERE GROUP BY command_name ORDER BY count DESC LIMIT 10');
        const topCommands = db.prepare(topCommandsQuery).all();

        const topUsersQuery = guildFilter('SELECT user_id as id, user_name as name, COUNT(*) as count FROM analytics_message_activity WHERE GROUP BY user_id, user_name ORDER BY count DESC LIMIT 10');
        const topUsers = db.prepare(topUsersQuery).all();

        const memberEventsQuery = guildFilter('SELECT event_type, COUNT(*) as count FROM analytics_member_events WHERE GROUP BY event_type');
        const memberEvents = db.prepare(memberEventsQuery).all();

        const joinCount = memberEvents.find(e => e.event_type === 'join')?.count || 0;
        const leaveCount = memberEvents.find(e => e.event_type === 'leave')?.count || 0;

        return {
            topCommands,
            topUsers,
            memberStats: {
                joinCount,
                leaveCount,
                netChange: joinCount - leaveCount
            }
        };
    } catch (error) {
        console.error('Error in getAnalyticsSummary:', error);
        return { topCommands: [], topUsers: [], memberStats: { joinCount: 0, leaveCount: 0, netChange: 0 } };
    }
}

async function computeGlobalStats() {
    try {
        const summary = getAnalyticsSummary();
        return {
            servers: client.guilds.cache.size || 0,
            users: client.guilds.cache.reduce((sum, g) => sum + (g.memberCount || 0), 0),
            latency: client.ws.ping || 0,
            commandsToday: summary.topCommands.reduce((sum, c) => sum + (c.count || 0), 0),
            ...summary
        };
    } catch (error) {
        console.error('Error computing global stats:', error);
        return null;
    }
}

// --- Admin API Routes ---

router.get('/api/admin/summary', requireAdmin, async (req, res) => {
  try {
    const DASHBOARD_GUILD_ID = process.env.GUILD_ID;
    const DASHBOARD_GUILD_NAME = client.guilds.cache.get(DASHBOARD_GUILD_ID)?.name || 'Default Guild';

    const sanitizedUser = {
      id: req.session.user.id,
      username: req.session.user.username,
      global_name: req.session.user.global_name,
      avatar: req.session.user.avatar,
      adminGuilds: req.session.user.adminGuilds || [{ id: DASHBOARD_GUILD_ID, name: DASHBOARD_GUILD_NAME }],
    };

    res.json({
      user: sanitizedUser,
      stats: {
        economy: getEconomySummary(),
        pokemon: getPokemonSummary(DASHBOARD_GUILD_ID),
        jobs: { activeJobs: listJobs().length },
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const globalStats = await computeGlobalStats();
    res.json(globalStats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/api/admin/guilds', requireAdmin, async (req, res) => {
    try {
        res.json(req.session.user.adminGuilds || []);
    } catch (err) {
        console.error('admin guilds error', err);
        res.status(500).json({ error: 'Failed to fetch guilds' });
    }
});

router.get('/api/admin/guilds/:guildId', ensureManageGuild, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = client?.guilds?.cache?.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    const channels = guild.channels.cache
      .filter(channel => channel.type === 0) // GUILD_TEXT
      .map(channel => ({ id: channel.id, name: channel.name, type: channel.type }));

    const roles = guild.roles.cache
      .filter(role => !role.managed && role.id !== guild.id)
      .map(role => ({ id: role.id, name: role.name, color: role.color }));

    const guildStats = getAnalyticsSummary(guildId);

    res.json({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
      icon: guild.iconURL({ dynamic: true }),
      channels,
      roles,
      stats: guildStats.memberStats
    });
  } catch (error) {
    console.error('Error fetching guild data:', error);
    res.status(500).json({ error: 'Failed to fetch guild data' });
  }
});

router.get('/api/admin/guilds/:guildId/commands', ensureManageGuild, async (req, res) => {
  try {
    const { guildId } = req.params;
    const summary = getAnalyticsSummary(guildId);
    const commandList = summary.topCommands.map(cmd => ({
      id: cmd.name,
      name: cmd.name,
      enabled: true, // Placeholder
      category: 'general' // Placeholder
    }));
    res.json(commandList);
  } catch (error) {
    console.error('Error fetching guild commands:', error);
    res.status(500).json({ error: 'Failed to fetch guild commands' });
  }
});

router.get('/api/admin/guilds/:guildId/modlogs', ensureManageGuild, async (req, res) => {
  try {
    const db = getDB();
    const { guildId } = req.params;
    const logs = db.prepare('SELECT * FROM mod_logs WHERE guild_id = ? ORDER BY timestamp DESC LIMIT 50').all(guildId);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching modlogs:', error);
    res.status(500).json({ error: 'Failed to fetch moderation logs' });
  }
});

router.get('/api/admin/guilds/:guildId/settings', ensureManageGuild, async (req, res) => {
  try {
    const db = getDB();
    const { guildId } = req.params;
    const defaultSettings = { prefix: '!', welcomeEnabled: false, welcomeChannelId: '', welcomeMessage: 'Welcome {user} to {server}!', leaveEnabled: false, leaveChannelId: '', leaveMessage: '{user} has left the server.', adminRoleId: '', modRoleId: '', djRoleId: '' };
    const row = db.prepare('SELECT settings FROM guild_settings WHERE guild_id = ?').get(guildId);
    const settings = row ? { ...defaultSettings, ...JSON.parse(row.settings) } : defaultSettings;
    res.json(settings);
  } catch (error) {
    console.error('Error fetching guild settings:', error);
    res.status(500).json({ error: 'Failed to fetch guild settings' });
  }
});

router.post('/api/admin/guilds/:guildId/settings', ensureManageGuild, async (req, res) => {
    try {
        const db = getDB();
        const { guildId } = req.params;
        const settings = req.body;
        if (typeof settings !== 'object' || settings === null) {
            return res.status(400).json({ error: 'Invalid settings format.' });
        }
        const settingsJson = JSON.stringify(settings);
        db.prepare('INSERT OR REPLACE INTO guild_settings (guild_id, settings) VALUES (?, ?)').run(guildId, settingsJson);
        res.json({ success: true, settings });
    } catch (error) {
        console.error('Error saving guild settings:', error);
        res.status(500).json({ error: 'Failed to save guild settings' });
    }
});

router.post('/api/admin/guilds/:guildId/console', ensureManageGuild, async (req, res) => {
    try {
      const { channelId, content } = req.body;
      const channel = client.channels.cache.get(channelId);
      if (!channel?.isTextBased()) {
        return res.status(400).json({ error: 'Invalid or non-text channel' });
      }
      await channel.send(content);
      res.json({ success: true });
    } catch (err) {
      console.error('Console send failed:', err);
      res.status(500).json({ error: 'Failed to send message' });
    }
});

// --- WebSocket Support ---

export async function getLiveStatsSnapshot() {
  return computeGlobalStats();
}

export default router;

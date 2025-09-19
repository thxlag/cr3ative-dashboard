import { Router } from 'express';
import { client } from '../../../index.js';
import { requireAdmin } from '../middleware/auth.js';
import { getDB } from '../../lib/db.js';
import { getEconomySummary } from '../../lib/econ.js'; // Assuming path
import { getAnalyticsData, recordMessageActivity, recordCommandUsage, recordMemberEvent, recordCommandError } from '../../analytics/tracker.js';
import { getPokemonSummary } from '../../modules/pokemon/service.js'; // Assuming path
import { getGuildJobsSummary } from '../../utils/jobs.js'; // Assuming path

const router = Router();
const ownerId = process.env.OWNER_ID?.trim();

// --- Middleware ---

// This middleware ensures the user has 'Manage Server' permissions for the specific guild they are trying to access.
const ensureManageGuild = async (req, res, next) => {
  try {
    if (!req.session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    // Bot owner bypasses permission checks
    if (req.session.user.id === ownerId) {
      return next();
    }
    const { guildId } = req.params;
    if (!guildId) {
      return res.status(400).json({ error: 'Guild ID is required.' });
    }
    const adminGuilds = req.session.user.adminGuilds || [];
    const hasPerm = adminGuilds.some(g => g.id === guildId);
    if (!hasPerm) {
      return res.status(403).json({ error: 'You do not have permission to manage this guild.' });
    }
    next();
  } catch (err) {
    console.error('ensureManageGuild middleware error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};


// --- Helper Functions ---

// Placeholder for a function that computes global stats.
// You would need to create this function, likely in a utils file.
async function computeGlobalStats() {
    try {
        const analyticsData = await getAnalyticsData();
        return {
            servers: client.guilds.cache.size || 0,
            users: client.guilds.cache.reduce((sum, g) => sum + (g.memberCount || 0), 0),
            latency: client.ws.ping || 0,
            commandsToday: analyticsData.topCommands.reduce((sum, c) => sum + (c.count || 0), 0),
            topCommands: analyticsData.topCommands,
            topUsers: analyticsData.topUsers,
            channelActivity: analyticsData.channelActivity,
            commandErrors: analyticsData.commandErrors,
            memberStats: analyticsData.memberStats
        };
    } catch (error) {
        console.error('Error computing global stats:', error);
        return null;
    }
}


// --- Admin API Routes ---

// GET summary stats for the dashboard homepage
router.get('/api/admin/summary', requireAdmin, async (req, res) => {
  try {
    const DASHBOARD_GUILD_ID = process.env.GUILD_ID; // Assuming a primary guild ID for some stats
    const DASHBOARD_GUILD_NAME = client.guilds.cache.get(DASHBOARD_GUILD_ID)?.name || 'Default Guild';

    const stats = getEconomySummary();
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
        economy: stats,
        pokemon: getPokemonSummary(DASHBOARD_GUILD_ID),
        jobs: { activeJobs: getGuildJobsSummary(DASHBOARD_GUILD_ID).length },
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET global bot stats
router.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const globalStats = await computeGlobalStats();
    res.json(globalStats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET list of guilds the user can manage
router.get('/api/admin/guilds', requireAdmin, async (req, res) => {
    try {
        res.json(req.session.user.adminGuilds || []);
    } catch (err) {
        console.error('admin guilds error', err);
        res.status(500).json({ error: 'Failed to fetch guilds' });
    }
});

// GET detailed data for a specific guild
router.get('/api/admin/guilds/:guildId', ensureManageGuild, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guild = client?.guilds?.cache?.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    const channels = guild.channels.cache
      .filter(channel => channel.type === 'GUILD_TEXT' || channel.type === 0) // 0 is GUILD_TEXT
      .map(channel => ({ id: channel.id, name: channel.name, type: channel.type }));

    const roles = guild.roles.cache
      .filter(role => !role.managed && role.id !== guild.id)
      .map(role => ({ id: role.id, name: role.name, color: role.color }));

    const analyticsData = await getAnalyticsData();
    const guildStats = analyticsData.memberStats?.find(g => g.guildId === guildId) || {
      joinCount: 0, leaveCount: 0, netChange: 0, recentJoins: [], recentLeaves: []
    };

    res.json({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
      icon: guild.iconURL({ dynamic: true }),
      channels,
      roles,
      stats: guildStats
    });
  } catch (error) {
    console.error('Error fetching guild data:', error);
    res.status(500).json({ error: 'Failed to fetch guild data' });
  }
});

// GET guild-specific commands (mocked, based on global analytics)
router.get('/api/admin/guilds/:guildId/commands', ensureManageGuild, async (req, res) => {
  try {
    const analyticsData = await getAnalyticsData();
    const commandList = analyticsData.topCommands.map(cmd => ({
      id: cmd.name,
      name: cmd.name,
      enabled: true, // This is a placeholder; real logic would be needed
      category: 'general' // This is a placeholder
    }));
    res.json(commandList);
  } catch (error) {
    console.error('Error fetching guild commands:', error);
    res.status(500).json({ error: 'Failed to fetch guild commands' });
  }
});

// GET guild moderation logs from the database
router.get('/api/admin/guilds/:guildId/modlogs', ensureManageGuild, async (req, res) => {
  try {
    const db = getDB();
    const { guildId } = req.params;
    // Assumes a table 'mod_logs' exists from a migration
    const logs = db.prepare('SELECT * FROM mod_logs WHERE guild_id = ? ORDER BY timestamp DESC LIMIT 50').all(guildId);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching modlogs:', error);
    res.status(500).json({ error: 'Failed to fetch moderation logs' });
  }
});

// GET guild settings from the database
router.get('/api/admin/guilds/:guildId/settings', ensureManageGuild, async (req, res) => {
  try {
    const db = getDB();
    const { guildId } = req.params;
    
    const defaultSettings = {
      prefix: '!', welcomeEnabled: false, welcomeChannelId: '', welcomeMessage: 'Welcome {user} to {server}!',
      leaveEnabled: false, leaveChannelId: '', leaveMessage: '{user} has left the server.',
      adminRoleId: '', modRoleId: '', djRoleId: ''
    };

    // Assumes a 'guild_settings' table with a JSON blob for settings
    const row = db.prepare('SELECT settings FROM guild_settings WHERE guild_id = ?').get(guildId);
    const settings = row ? { ...defaultSettings, ...JSON.parse(row.settings) } : defaultSettings;
    
    res.json(settings);
  } catch (error) {
    console.error('Error fetching guild settings:', error);
    res.status(500).json({ error: 'Failed to fetch guild settings' });
  }
});

// POST updated guild settings to the database
router.post('/api/admin/guilds/:guildId/settings', ensureManageGuild, async (req, res) => {
    try {
        const db = getDB();
        const { guildId } = req.params;
        const settings = req.body;

        // Basic validation
        if (typeof settings !== 'object' || settings === null) {
            return res.status(400).json({ error: 'Invalid settings format.' });
        }

        const settingsJson = JSON.stringify(settings);
        db.prepare('INSERT OR REPLACE INTO guild_settings (guild_id, settings) VALUES (?, ?)')
          .run(guildId, settingsJson);

        res.json({ success: true, settings });
    } catch (error) {
        console.error('Error saving guild settings:', error);
        res.status(500).json({ error: 'Failed to save guild settings' });
    }
});


// POST a message to a channel via the bot (console feature)
router.post('/api/admin/guilds/:guildId/console', ensureManageGuild, async (req, res) => {
    try {
      const { channelId, content } = req.body;
      const channel = client.channels.cache.get(channelId);
      // channel.isText() is deprecated, check for isTextBased()
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

// Function to be called by the WebSocket server to get a fresh snapshot of stats
export async function getLiveStatsSnapshot() {
  return computeGlobalStats();
}

export default router;
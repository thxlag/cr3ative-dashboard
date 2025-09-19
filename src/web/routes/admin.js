import { Router } from 'express';
import { client } from '../../../index.js';
import { ensureAuthenticated, ensureManageGuild } from '../../utils/auth.js';

const router = Router();

const requireAuth = (req, res, next) => {
	if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
	next();
};

router.get('/api/admin/stats', requireAuth, async (req, res) => {
	try {
		const client = req.app.get('client');
		let analytics = { topCommands: [], commandsToday: 0 };
		try {
			const mod = await import('../../analytics/tracker.js');
			analytics = mod.getAnalyticsData() || analytics;
		} catch {}
		const servers = client?.guilds?.cache?.size || 0;
		const users = client?.guilds?.cache?.reduce((a, g) => a + (g.memberCount || 0), 0) || 0;
		const latency = client?.ws?.ping || 0;
		return res.json({
			servers,
			users,
			latency,
			commandsToday: analytics.commandsToday || 0,
			topCommands: analytics.topCommands || []
		});
	} catch (err) {
		console.error('admin stats error', err);
		return res.status(500).json({ error: 'Failed to fetch stats' });
	}
});

router.get('/api/admin/guilds', requireAuth, async (req, res) => {
	try {
		const client = req.app.get('client');
		const guilds = client?.guilds?.cache?.map(g => ({ id: g.id, name: g.name, memberCount: g.memberCount })) || [];
		return res.json(guilds);
	} catch (err) {
		console.error('admin guilds error', err);
		return res.status(500).json({ error: 'Failed to fetch guilds' });
	}
});

// Get specific guild data
router.get('/api/admin/guilds/:guildId', requireAuth, async (req, res) => {
  try {
    const client = req.app.get('client');
    const { guildId } = req.params;
    
    const guild = client?.guilds?.cache?.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Guild not found' });
    }
    
    const channels = guild.channels.cache
      .filter(channel => channel.type === 'GUILD_TEXT' || channel.type === 0)
      .map(channel => ({
        id: channel.id,
        name: channel.name,
        type: channel.type
      }));
    
    const roles = guild.roles.cache
      .filter(role => !role.managed && role.id !== guild.id)
      .map(role => ({
        id: role.id,
        name: role.name,
        color: role.color
      }));
    
    // Get analytics for this guild
    const analyticsData = await getAnalyticsData();
    const guildStats = analyticsData.memberStats?.find(g => g.guildId === guildId) || { 
      joinCount: 0, 
      leaveCount: 0, 
      netChange: 0 
    };
    
    res.json({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
      icon: guild.iconURL({ dynamic: true }),
      channels,
      roles,
      stats: {
        joinCount: guildStats.joinCount,
        leaveCount: guildStats.leaveCount,
        netChange: guildStats.netChange,
        recentJoins: guildStats.recentJoins || [],
        recentLeaves: guildStats.recentLeaves || []
      }
    });
  } catch (error) {
    console.error('Error fetching guild data:', error);
    res.status(500).json({ error: 'Failed to fetch guild data' });
  }
});

// Get guild-specific commands
router.get('/api/admin/guilds/:guildId/commands', requireAuth, async (req, res) => {
  try {
    const analyticsData = await getAnalyticsData();
    const commandList = analyticsData.topCommands.map(cmd => ({
      id: cmd.name,
      name: cmd.name,
      enabled: true,
      category: 'general' // Would need more detailed tracking to categorize commands
    }));
    
    res.json(commandList);
  } catch (error) {
    console.error('Error fetching guild commands:', error);
    res.status(500).json({ error: 'Failed to fetch guild commands' });
  }
});

// Get guild moderation logs
router.get('/api/admin/guilds/:guildId/modlogs', requireAuth, async (req, res) => {
  try {
    // You would ideally store these in your database
    // This is a placeholder for demo purposes
    res.json([]);
  } catch (error) {
    console.error('Error fetching modlogs:', error);
    res.status(500).json({ error: 'Failed to fetch moderation logs' });
  }
});

// Get guild settings
router.get('/api/admin/guilds/:guildId/settings', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { guildId } = req.params;
    
    // Default settings if none found in DB
    const settings = {
      prefix: '!',
      welcomeEnabled: false,
      welcomeChannelId: '',
      welcomeMessage: 'Welcome {user} to {server}!',
      leaveEnabled: false,
      leaveChannelId: '',
      leaveMessage: '{user} has left the server.',
      adminRoleId: '',
      modRoleId: '',
      djRoleId: ''
    };
    
    res.json(settings);
  } catch (error) {
    console.error('Error fetching guild settings:', error);
    res.status(500).json({ error: 'Failed to fetch guild settings' });
  }
});

// Live stats snapshot for WebSocket updates
export async function getLiveStatsSnapshot() {
  try {
    const analyticsData = await getAnalyticsData();
    
    return {
      servers: global.client?.guilds?.cache?.size || 0,
      users: global.client?.guilds?.cache.reduce((acc, guild) => acc + guild.memberCount, 0) || 0,
      latency: global.client?.ws?.ping || 0,
      commandsToday: analyticsData.topCommands.reduce((total, cmd) => total + cmd.count, 0) || 0,
      topCommands: analyticsData.topCommands,
      topUsers: analyticsData.topUsers,
      channelActivity: analyticsData.channelActivity,
      commandErrors: analyticsData.commandErrors,
      memberStats: analyticsData.memberStats
    };
  } catch (error) {
    console.error('Error generating live stats snapshot:', error);
    return null;
  }
}

// Auth middleware to ensure only authorized users can access admin endpoints
const requireAuth = (req, res, next) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Get global stats
router.get('/api/admin/stats', requireAuth, async (req, res) => {
  try {
    const client = req.app.get('client');
    
    const guilds = client?.guilds?.cache?.size || 0;
    const users = client?.guilds?.cache.reduce((acc, guild) => acc + guild.memberCount, 0) || 0;
    const latency = client?.ws?.ping || 0;
    
    // Get command usage from analytics
    const analyticsData = await getAnalyticsData();
    const topCommands = analyticsData.topCommands || [];
    
    // Calculate commands used today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const commandsToday = analyticsData.topCommands.reduce((total, cmd) => total + cmd.count, 0) || 0;
    
    res.json({
      servers: guilds,
      users,
      latency,
      commandsToday,
      topCommands
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get guild list
router.get('/api/admin/guilds', requireAuth, async (req, res) => {
  try {
    const client = req.app.get('client');
    const guilds = client?.guilds?.cache?.map(guild => ({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
      icon: guild.iconURL({ dynamic: true })
    })) || [];
    
    res.json(guilds);
  } catch (error) {
    console.error('Error fetching guilds:', error);
    res.status(500).json({ error: 'Failed to fetch guilds' });
  }
});

// Get specific guild data
router.get('/api/admin/guilds/:guildId', requireAuth, async (req, res) => {
  try {
    const client = req.app.get('client');
    const { guildId } = req.params;
    
    const guild = client?.guilds?.cache?.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Guild not found' });
    }
    
    const channels = guild.channels.cache
      .filter(channel => channel.type === 'GUILD_TEXT' || channel.type === 0)
      .map(channel => ({
        id: channel.id,
        name: channel.name,
        type: channel.type
      }));
    
    const roles = guild.roles.cache
      .filter(role => !role.managed && role.id !== guild.id)
      .map(role => ({
        id: role.id,
        name: role.name,
        color: role.color
      }));
    
    res.json({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
      icon: guild.iconURL({ dynamic: true }),
      channels,
      roles
    });
  } catch (error) {
    console.error('Error fetching guild data:', error);
    res.status(500).json({ error: 'Failed to fetch guild data' });
  }
});

// Get guild-specific commands
router.get('/api/admin/guilds/:guildId/commands', requireAuth, async (req, res) => {
  try {
    const analyticsData = await getAnalyticsData();
    const commandList = analyticsData.topCommands.map(cmd => ({
      id: cmd.name,
      name: cmd.name,
      enabled: true,
      category: 'general' // Would need more detailed tracking to categorize commands
    }));
    
    res.json(commandList);
  } catch (error) {
    console.error('Error fetching guild commands:', error);
    res.status(500).json({ error: 'Failed to fetch guild commands' });
  }
});

// Get guild moderation logs
router.get('/api/admin/guilds/:guildId/modlogs', requireAuth, async (req, res) => {
  try {
    // You would ideally store these in your database
    // This is a placeholder for demo purposes
    res.json([]);
  } catch (error) {
    console.error('Error fetching modlogs:', error);
    res.status(500).json({ error: 'Failed to fetch moderation logs' });
  }
});

// Get guild settings
router.get('/api/admin/guilds/:guildId/settings', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { guildId } = req.params;
    
    // Default settings if none found in DB
    const settings = {
      prefix: '!',
      welcomeEnabled: false,
      welcomeChannelId: '',
      welcomeMessage: 'Welcome {user} to {server}!',
      leaveEnabled: false,
      leaveChannelId: '',
      leaveMessage: '{user} has left the server.',
      adminRoleId: '',
      modRoleId: '',
      djRoleId: ''
    };
    
    res.json(settings);
  } catch (error) {
    console.error('Error fetching guild settings:', error);
    res.status(500).json({ error: 'Failed to fetch guild settings' });
  }
});

// New: Console endpoint
router.post(
  '/guilds/:guildId/console',
  ensureAuthenticated,
  ensureManageGuild,
  async (req, res) => {
    try {
      const { channelId, content } = req.body;
      const channel = client.channels.cache.get(channelId);
      if (!channel?.isText()) {
        return res.status(400).json({ error: 'Invalid text channel' });
      }
      await channel.send(content);
      res.json({ success: true });
    } catch (err) {
      console.error('Console send failed:', err);
      res.status(500).json({ error: 'Failed to send message' });
    }
  }
);

// Live stats snapshot for WebSocket updates
export async function getLiveStatsSnapshot() {
  try {
    const analyticsData = await getAnalyticsData();
    
    return {
      servers: global.client?.guilds?.cache?.size || 0,
      users: global.client?.guilds?.cache.reduce((acc, guild) => acc + guild.memberCount, 0) || 0,
      latency: global.client?.ws?.ping || 0,
      commandsToday: analyticsData.topCommands.reduce((total, cmd) => total + cmd.count, 0) || 0,
      topCommands: analyticsData.topCommands,
      topUsers: analyticsData.topUsers,
      channelActivity: analyticsData.channelActivity,
      commandErrors: analyticsData.commandErrors,
      memberStats: analyticsData.memberStats
    };
  } catch (error) {
    console.error('Error generating live stats snapshot:', error);
    return null;
  }
}

export default router;
      return res.status(404).json({ error: 'Guild not found' });
    }
    
    const channels = guild.channels.cache
      .filter(channel => channel.type === 'GUILD_TEXT' || channel.type === 0)
      .map(channel => ({
        id: channel.id,
        name: channel.name,
        type: channel.type
      }));
    
    const roles = guild.roles.cache
      .filter(role => !role.managed && role.id !== guild.id)
      .map(role => ({
        id: role.id,
        name: role.name,
        color: role.color
      }));
    
    res.json({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
      icon: guild.iconURL({ dynamic: true }),
      channels,
      roles
    });
  } catch (error) {
    console.error('Error fetching guild data:', error);
    res.status(500).json({ error: 'Failed to fetch guild data' });
  }
});

// Get guild-specific commands
router.get('/api/admin/guilds/:guildId/commands', requireAuth, async (req, res) => {
  try {
    const analyticsData = await getAnalyticsData();
    const commandList = analyticsData.topCommands.map(cmd => ({
      id: cmd.name,
      name: cmd.name,
      enabled: true,
      category: 'general' // Would need more detailed tracking to categorize commands
    }));
    
    res.json(commandList);
  } catch (error) {
    console.error('Error fetching guild commands:', error);
    res.status(500).json({ error: 'Failed to fetch guild commands' });
  }
});

// Get guild moderation logs
router.get('/api/admin/guilds/:guildId/modlogs', requireAuth, async (req, res) => {
  try {
    // You would ideally store these in your database
    // This is a placeholder for demo purposes
    res.json([]);
  } catch (error) {
    console.error('Error fetching modlogs:', error);
    res.status(500).json({ error: 'Failed to fetch moderation logs' });
  }
});

// Get guild settings
router.get('/api/admin/guilds/:guildId/settings', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const { guildId } = req.params;
    
    // Default settings if none found in DB
    const settings = {
      prefix: '!',
      welcomeEnabled: false,
      welcomeChannelId: '',
      welcomeMessage: 'Welcome {user} to {server}!',
      leaveEnabled: false,
      leaveChannelId: '',
      leaveMessage: '{user} has left the server.',
      adminRoleId: '',
      modRoleId: '',
      djRoleId: ''
    };
    
    res.json(settings);
  } catch (error) {
    console.error('Error fetching guild settings:', error);
    res.status(500).json({ error: 'Failed to fetch guild settings' });
  }
});

// Live stats snapshot for WebSocket updates
export async function getLiveStatsSnapshot() {
  try {
    const analyticsData = await getAnalyticsData();
    
    return {
      servers: global.client?.guilds?.cache?.size || 0,
      users: global.client?.guilds?.cache.reduce((acc, guild) => acc + guild.memberCount, 0) || 0,
      latency: global.client?.ws?.ping || 0,
      commandsToday: analyticsData.topCommands.reduce((total, cmd) => total + cmd.count, 0) || 0,
      topCommands: analyticsData.topCommands,
      topUsers: analyticsData.topUsers,
      channelActivity: analyticsData.channelActivity,
      commandErrors: analyticsData.commandErrors,
      memberStats: analyticsData.memberStats
    };
  } catch (error) {
    console.error('Error generating live stats snapshot:', error);
    return null;
  }
}

export async function getLiveStatsSnapshot() {
  return computeGlobalStats();
}

export default router;
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

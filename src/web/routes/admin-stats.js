import { Router } from 'express';

const router = Router();

// Auth middleware to ensure only authorized users can access admin endpoints
const requireAuth = (req, res, next) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Get global stats - safe implementation that won't crash
router.get('/api/admin/stats', requireAuth, async (req, res) => {
  try {
    const client = req.app.get('client');
    
    // Get basic stats from the client
    const guilds = client?.guilds?.cache?.size || 0;
    const users = client?.guilds?.cache?.reduce((acc, guild) => acc + (guild.memberCount || 0), 0) || 0;
    const latency = client?.ws?.ping || 0;
    
    // Try to get analytics data
    let analyticsData = {
      topCommands: [],
      commandErrors: [],
      timestamp: Date.now()
    };
    
    try {
      const { getAnalyticsData } = await import('../../analytics/tracker.js');
      analyticsData = await getAnalyticsData() || analyticsData;
    } catch (err) {
      console.error('Error loading analytics data:', err);
    }
    
    res.json({
      servers: guilds,
      users,
      latency,
      commandsToday: analyticsData.topCommands.reduce((total, cmd) => total + (cmd.count || 0), 0),
      topCommands: analyticsData.topCommands || []
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Add this route to your main routes file
export default router;

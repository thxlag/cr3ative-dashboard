import express from 'express';
import path from 'path';
import { client } from './index.js';              // your Discord client
import { ensureAuthenticated, ensureManageGuild } from './utils/auth.js';

const app = express();
app.use(express.json());

// serve dashboard static files with no-cache
app.use(
  express.static(
    path.join(process.cwd(), 'src/web/public'),
    { etag: false, maxAge: 0 }
  )
);

// ...existing admin‐API routes for guilds, commands, modlogs, etc...

// New: Console panel endpoint
app.post(
  '/api/admin/guilds/:guildId/console',
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

// ...other routes…

const PORT = process.env.DASHBOARD_PORT || 4003;
app.listen(PORT, () => console.log(`Dashboard listening on ${PORT}`));

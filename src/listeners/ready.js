import { Events, ActivityType } from 'discord.js';
import { log } from '../utils/logger.js';
import { ensureEventScheduler, setupAutoEventScheduler } from '../utils/events.js';
import { setupLotteryScheduler } from '../utils/lottery.js';
import { setupMinesExpiry } from '../utils/mines.js';

export function setupReady(client) {
  const text = process.env.STATUS_TEXT || '/help v5.02';
  const streamUrl = process.env.STREAM_URL || 'https://twitch.tv/discord';
  client.once(Events.ClientReady, () => {
    client.user.setPresence({
      activities: [{ name: text, type: ActivityType.Streaming, url: streamUrl }],
      status: 'online'
    });
    log.ok(`Logged in as ${client.user.tag}`);
    // Initialize any active event timers after the client is ready
    ensureEventScheduler(client);
    setupAutoEventScheduler(client);
    try { setupLotteryScheduler(client); } catch {}
    // Start periodic expiry for mines rounds stored in DB/memory
    try { setupMinesExpiry(); } catch {}
  });
}

import { getUser as getUserEcon, incWallet } from '../lib/econ.js';

// Receives stream chat messages from manager.
// Replace resolveLinkedDiscordId and XP logic with your implementation.
export async function processChatMessage({ platform, platformUserId, username, message, discordClient }) {
  try {
    console.log(`[stream][${platform}] ${username}: ${message}`);
    // Example placeholder:
    // const linkedDiscordId = await resolveLinkedDiscordId(platform, platformUserId);
    // if (linkedDiscordId) {
    //   incWallet(linkedDiscordId, 1, `stream_active_${platform}`);
    // }
  } catch (e) {
// ...existing code...
    console.error('processChatMessage error', e);
  }
}

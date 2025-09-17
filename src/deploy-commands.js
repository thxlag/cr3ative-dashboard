import 'dotenv/config';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { loadCommands, registerCommands } from './utils/registry.js';

const { BOT_TOKEN, CLIENT_ID } = process.env;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is missing in .env');
  process.exit(1);
}
if (!CLIENT_ID) {
  console.error('❌ CLIENT_ID (Application ID) is missing in .env');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

client.once('ready', async () => {
  try {
    await loadCommands(client);
    await registerCommands(client);
    console.log('✅ Deploy complete.');
  } catch (e) {
    console.error('❌ Deploy failed:', e);
  } finally {
    process.exit(0);
  }
});

client.login(BOT_TOKEN).catch((e) => {
  console.error('❌ Failed to login with BOT_TOKEN:', e.message);
  process.exit(1);
});

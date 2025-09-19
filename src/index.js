
import "dotenv/config";
import { Client, Collection, GatewayIntentBits, Partials, Events } from "discord.js";
import { registerCommands, loadCommands } from "./utils/registry.js";
import { log } from "./utils/logger.js";
import { ensureDB, getDB } from "./lib/db.js";
import { onInteraction } from "./listeners/interactionCreate.js";
import { setupReady } from "./listeners/ready.js";
import { onMessageCreate } from "./listeners/messageCreate.js";
import { onMessageAnalytics } from "./listeners/messageAnalytics.js";
import guildMemberAddListener from './listeners/guildMemberAdd.js';
import guildMemberRemoveListener from './listeners/guildMemberRemove.js';
import { onStreamChat, startStreamManager } from "./streams/manager.js";
import { processChatMessage } from "./streams/bridge.js";
import StreamHandler from "./modules/streaming/streamHandler.js";
import streamEventHandler from "./modules/streaming/events/streamEvents.js";
import { initPokemon } from "./modules/pokemon/service.js";

// --- Environment Variable Validation ---
log.info("Validating environment variables...");
const requiredEnvVars = ['BOT_TOKEN', 'CLIENT_ID', 'GUILD_ID'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    log.error(`Missing required environment variable: ${envVar}. Exiting.`);
    process.exit(1);
  }
}

// --- Client Initialization ---
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

client.commands = new Collection();
client.streamHandler = null;

// --- Main Async Function ---
async function main() {
  log.info("Starting bot initialization...");

  // Database and Commands
  await ensureDB();
  const db = getDB();
  await loadCommands(client);
  await registerCommands(client);

  // Module Initializations
  await initPokemon(client, db);
  try {
    const handler = await new StreamHandler(client, db).initialize();
    client.streamHandler = handler;
    log.info("Stream handler initialized successfully.");
  } catch (error) {
    log.error("Failed to initialize stream handler:", error);
  }

  // --- Event Listener Registration ---
  log.info("Registering event listeners...");

  setupReady(client); // Special case for the ready event

  client.on(Events.MessageCreate, onMessageCreate);
  client.on(Events.MessageCreate, onMessageAnalytics);
  
  // Use the default export and call the execute method
  client.on(Events.GuildMemberAdd, (...args) => guildMemberAddListener.execute(...args, client));
  client.on(Events.GuildMemberRemove, (...args) => guildMemberRemoveListener.execute(...args, client));

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // Primary interaction handler
      await onInteraction(interaction, db, client.streamHandler);
      
      // Secondary handler for stream-related interactions
      if (streamEventHandler?.execute) {
        await streamEventHandler.execute(interaction, client, db, client.streamHandler);
      }
    } catch (error) {
      log.error("Error during interaction handling:", error);
    }
  });

  // Stream Chat Integration
  onStreamChat(async (platform, meta) => {
    try {
      await processChatMessage({ ...meta, platform, discordClient: client });
    } catch (error) {
      log.error("Stream chat processing failed:", error);
    }
  });

  startStreamManager();

  // --- Process-wide Error Handling ---
  process.on('unhandledRejection', error => {
    log.error('Unhandled promise rejection:', error);
  });

  // --- Client Login ---
  try {
    log.info("Logging in to Discord...");
    await client.login(process.env.BOT_TOKEN);
  } catch (error) {
    log.error("Failed to login. Check the BOT_TOKEN in your .env file.", error);
    process.exit(1);
  }
}

main();

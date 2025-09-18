import "dotenv/config";
import { Client, Collection, GatewayIntentBits, Partials, Events } from "discord.js";
import { registerCommands, loadCommands } from "./utils/registry.js";
import { log } from "./utils/logger.js";
import { ensureDB, getDB } from "./lib/db.js";
import { onInteraction } from "./listeners/interactionCreate.js";
import { setupReady } from "./listeners/ready.js";
import { onMessageCreate } from "./listeners/messageCreate.js";
import { onMessageAnalytics } from "./listeners/messageAnalytics.js";
import { onGuildMemberAdd } from "./listeners/guildMemberAdd.js";
import { onGuildMemberRemove } from "./listeners/guildMemberRemove.js";
import { onStreamChat, startStreamManager } from "./streams/manager.js";
import { processChatMessage } from "./streams/bridge.js";
import StreamHandler from "./modules/streaming/streamHandler.js";
import streamEventHandler from "./modules/streaming/events/streamEvents.js";
import { initPokemon } from "./modules/pokemon/service.js";

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

setupReady(client);

await ensureDB();
await loadCommands(client);
await registerCommands(client);

const db = getDB();
await initPokemon(client, db);

client.on(Events.MessageCreate, onMessageCreate);
client.on(Events.MessageCreate, onMessageAnalytics);
client.on(Events.GuildMemberAdd, onGuildMemberAdd);
client.on(Events.GuildMemberRemove, onGuildMemberRemove);

onStreamChat(async (platform, meta) => {
  try {
    await processChatMessage({ ...meta, platform, discordClient: client });
  } catch (error) {
    log.error("Stream chat processing failed", error);
  }
});

startStreamManager();

try {
  const handler = await new StreamHandler(client, db).initialize();
  client.streamHandler = handler;
  log.info("Stream handler initialized successfully");
} catch (error) {
  log.error("Failed to initialize stream handler", error);
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await onInteraction(interaction, db, client.streamHandler);
  } catch (error) {
    log.error("Error handling interaction", error);
  }

  if (streamEventHandler?.execute) {
    try {
      await streamEventHandler.execute(interaction, client, db, client.streamHandler);
    } catch (error) {
      log.error("Error in streamEventHandler", error);
    }
  }
});

client.login(process.env.BOT_TOKEN).catch((error) => {
  log.error("Failed to login. Check BOT_TOKEN in .env");
  console.error(error);
});

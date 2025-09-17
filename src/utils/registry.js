import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { log } from './logger.js';
import { Collection } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadCommands(client){
  if (!client.commands) client.commands = new Collection();
  const cmdDir = path.join(__dirname, '..', 'commands');
  const categories = readdirSync(cmdDir);
  for(const cat of categories){
    const files = readdirSync(path.join(cmdDir, cat)).filter(f => f.endsWith('.js'));
    for(const file of files){
      // Convert Windows path to file URL for ESM import compatibility
      const filePath = path.join(cmdDir, cat, file);
      const fileUrl = pathToFileURL(filePath).href;
      const cmd = (await import(fileUrl)).default;
      if(!cmd?.data || !cmd?.execute) continue;
      client.commands.set(cmd.data.name, cmd);
    }
  }
  log.ok(`Loaded ${client.commands.size} commands across ${categories.length} categories`);
}

export async function registerCommands(client){
  const commandsJSON = [...client.commands.values()].map(c => c.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!clientId) {
    log.error('CLIENT_ID missing in .env; cannot deploy commands.');
    return;
  }

  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandsJSON });
      log.ok(`Registered ${commandsJSON.length} guild commands to ${guildId}`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commandsJSON });
      log.ok(`Registered ${commandsJSON.length} global commands`);
    }
  } catch (e){
    log.error('Command registration failed (check BOT_TOKEN / CLIENT_ID / GUILD_ID).');
    console.error(e);
  }
}

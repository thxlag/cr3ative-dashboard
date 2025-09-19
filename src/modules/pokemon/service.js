import fetch from 'node-fetch';
import { EmbedBuilder } from 'discord.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('Pokemon');

const DEFAULT_SPAWN_CHANCE = 0.04;
const DEFAULT_COOLDOWN_SECONDS = 45;
const DEFAULT_DESPAWN_SECONDS = 120;
const MAX_MON_ID = 898;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const normalizeName = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const prettifyName = (raw) => raw
  .split('-')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

class PokemonService {
  constructor() {
    this.client = null;
    this.db = null;
    this.ready = false;
    this.spawnChance = DEFAULT_SPAWN_CHANCE;
    this.spawnCooldownMs = DEFAULT_COOLDOWN_SECONDS * 1000;
    this.despawnMs = DEFAULT_DESPAWN_SECONDS * 1000;
    this.maxPokemonId = MAX_MON_ID;
    this.activeSpawns = new Map();
    this.spawnTimers = new Map();
    this.lastSpawnAt = new Map();
    this.baseConfig = null;
  }

  async init(client, db) {
    if (this.ready) return;
    this.client = client;
    this.db = db;

    const chance = Number(process.env.POKEMON_SPAWN_CHANCE ?? DEFAULT_SPAWN_CHANCE);
    this.spawnChance = clamp(Number.isFinite(chance) ? chance : DEFAULT_SPAWN_CHANCE, 0.001, 0.25);

    const cooldownSeconds = Number(process.env.POKEMON_SPAWN_COOLDOWN_SECONDS ?? DEFAULT_COOLDOWN_SECONDS);
    this.spawnCooldownMs = Math.max(5000, (Number.isFinite(cooldownSeconds) ? cooldownSeconds : DEFAULT_COOLDOWN_SECONDS) * 1000);

    const despawnSeconds = Number(process.env.POKEMON_DESPAWN_SECONDS ?? DEFAULT_DESPAWN_SECONDS);
    this.despawnMs = Math.max(30000, (Number.isFinite(despawnSeconds) ? despawnSeconds : DEFAULT_DESPAWN_SECONDS) * 1000);

    const maxId = Number(process.env.POKEMON_MAX_ID ?? MAX_MON_ID);
    this.maxPokemonId = Math.max(1, Number.isFinite(maxId) ? Math.min(maxId, 1010) : MAX_MON_ID);

    this.baseConfig = {
      spawnChance: this.spawnChance,
      spawnCooldownMs: this.spawnCooldownMs,
      despawnMs: this.despawnMs,
      maxPokemonId: this.maxPokemonId,
    };

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pokemon_spawns (
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        pokemon_id INTEGER NOT NULL,
        pokemon_display TEXT NOT NULL,
        pokemon_raw TEXT NOT NULL,
        pokemon_answer TEXT NOT NULL,
        sprite_url TEXT,
        hint TEXT,
        spawned_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, channel_id)
      );

      CREATE TABLE IF NOT EXISTS pokemon_captures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        pokemon_id INTEGER NOT NULL,
        pokemon_display TEXT NOT NULL,
        pokemon_raw TEXT NOT NULL,
        sprite_url TEXT,
        captured_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_pokemon_captures_guild_user
        ON pokemon_captures (guild_id, user_id);

      CREATE INDEX IF NOT EXISTS idx_pokemon_captures_guild
        ON pokemon_captures (guild_id);
    `);

    this.insertSpawn = this.db.prepare(`
      INSERT OR REPLACE INTO pokemon_spawns (
        guild_id, channel_id, message_id, pokemon_id, pokemon_display,
        pokemon_raw, pokemon_answer, sprite_url, hint, spawned_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.deleteSpawnStmt = this.db.prepare('DELETE FROM pokemon_spawns WHERE guild_id = ? AND channel_id = ?');
    this.insertCaptureStmt = this.db.prepare(`
      INSERT INTO pokemon_captures (
        guild_id, user_id, pokemon_id, pokemon_display, pokemon_raw, sprite_url, captured_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.countCapturesStmt = this.db.prepare('SELECT COUNT(*) AS total FROM pokemon_captures WHERE guild_id = ? AND user_id = ?');
    this.countUniqueStmt = this.db.prepare('SELECT COUNT(DISTINCT pokemon_id) AS total FROM pokemon_captures WHERE guild_id = ? AND user_id = ?');
    this.recentCaptureStmt = this.db.prepare('SELECT pokemon_display, captured_at FROM pokemon_captures WHERE guild_id = ? AND user_id = ? ORDER BY captured_at DESC LIMIT 1');
    this.userTopStmt = this.db.prepare('SELECT pokemon_display, COUNT(*) AS total FROM pokemon_captures WHERE guild_id = ? AND user_id = ? GROUP BY pokemon_id ORDER BY total DESC LIMIT 5');
    this.guildTopStmt = this.db.prepare('SELECT user_id, COUNT(*) AS total FROM pokemon_captures WHERE guild_id = ? GROUP BY user_id ORDER BY total DESC LIMIT 5');

    const rows = this.db.prepare('SELECT * FROM pokemon_spawns').all();
    const now = Date.now();
    for (const row of rows) {
      if (row.expires_at <= now) {
        this.deleteSpawnStmt.run(row.guild_id, row.channel_id);
        continue;
      }
      const spawn = {
        guildId: row.guild_id,
        channelId: row.channel_id,
        messageId: row.message_id,
        pokemonId: row.pokemon_id,
        pokemonDisplay: row.pokemon_display,
        pokemonRaw: row.pokemon_raw,
        answer: row.pokemon_answer,
        spriteUrl: row.sprite_url,
        hint: row.hint,
        spawnedAt: row.spawned_at,
        expiresAt: row.expires_at,
      };
      const key = this.key(spawn.guildId, spawn.channelId);
      this.activeSpawns.set(key, spawn);
      this.lastSpawnAt.set(key, spawn.spawnedAt);
      const delay = Math.max(1000, spawn.expiresAt - now);
      this.scheduleDespawn(spawn, delay);
    }

    this.ready = true;
    logger.ok('Pokemon module initialised');
  }

  key(guildId, channelId) {
    return `${guildId}:${channelId}`;
  }

  async handleMessage(message) {
    if (!this.ready) return;
    if (!message.guild) return;
    if (!message.channel?.isTextBased?.()) return;

    const key = this.key(message.guild.id, message.channel.id);
    if (this.activeSpawns.has(key)) return;

    const now = Date.now();
    const last = this.lastSpawnAt.get(key) || 0;
    if (now - last < this.spawnCooldownMs) return;

    if (Math.random() > this.spawnChance) return;

    try {
      await this.spawnPokemon(message.channel);
    } catch (error) {
      logger.warn('Failed to spawn pokemon', error);
    }
  }

  async spawnPokemon(channel) {
    const info = await this.getRandomPokemon();
    if (!info) return;

    const spawn = {
      guildId: channel.guildId,
      channelId: channel.id,
      messageId: '',
      pokemonId: info.id,
      pokemonDisplay: info.displayName,
      pokemonRaw: info.rawName,
      answer: normalizeName(info.rawName),
      spriteUrl: info.spriteUrl,
      hint: this.buildHint(info),
      spawnedAt: Date.now(),
      expiresAt: Date.now() + this.despawnMs,
    };

    const embed = this.buildSpawnEmbed(spawn);
    const sent = await channel.send({ embeds: [embed] });
    spawn.messageId = sent.id;

    const key = this.key(spawn.guildId, spawn.channelId);
    this.activeSpawns.set(key, spawn);
    this.lastSpawnAt.set(key, spawn.spawnedAt);
    this.insertSpawn.run(
      spawn.guildId,
      spawn.channelId,
      spawn.messageId,
      spawn.pokemonId,
      spawn.pokemonDisplay,
      spawn.pokemonRaw,
      spawn.answer,
      spawn.spriteUrl,
      spawn.hint,
      spawn.spawnedAt,
      spawn.expiresAt,
    );
    this.scheduleDespawn(spawn, this.despawnMs);
  }

  scheduleDespawn(spawn, delayMs) {
    const key = this.key(spawn.guildId, spawn.channelId);
    if (this.spawnTimers.has(key)) {
      clearTimeout(this.spawnTimers.get(key));
    }
    const timer = setTimeout(() => {
      this.spawnTimers.delete(key);
      this.handleDespawn(spawn).catch((error) => logger.warn('Failed to despawn pokemon', error));
    }, delayMs);
    this.spawnTimers.set(key, timer);
  }

  async handleDespawn(spawn) {
    const key = this.key(spawn.guildId, spawn.channelId);
    if (!this.activeSpawns.has(key)) return;

    this.activeSpawns.delete(key);
    this.deleteSpawnStmt.run(spawn.guildId, spawn.channelId);

    await this.updateSpawnMessage(spawn, {
      title: `${spawn.pokemonDisplay} fled!`,
      description: 'Nobody caught this one in time.',
      color: 0xEF476F,
    });

    try {
      const channel = await this.fetchChannel(spawn.channelId);
      if (channel?.isTextBased?.()) {
        await channel.send({ content: `? The wild **${spawn.pokemonDisplay}** fled.` });
      }
    } catch {}
  }

  async handleCatch(interaction, guess) {
    if (!this.ready) {
      await interaction.reply({ content: 'Pokemon module is still initialising, try again shortly.', ephemeral: true });
      return;
    }
    if (!interaction.guild) {
      await interaction.reply({ content: 'This mini-game only works in servers.', ephemeral: true });
      return;
    }

    const normalizedGuess = normalizeName(guess || '');
    if (!normalizedGuess) {
      await interaction.reply({ content: 'Please provide a valid Pokemon name.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const key = this.key(interaction.guild.id, interaction.channelId);
    const spawn = this.activeSpawns.get(key);
    if (!spawn) {
      await interaction.editReply('There is no wild Pokemon to catch right now. Keep chatting to spawn one!');
      return;
    }

    if (normalizedGuess !== spawn.answer) {
      await interaction.editReply('Not quite! Try again. Use `/pokemon hint` if you need a clue.');
      return;
    }

    this.activeSpawns.delete(key);
    this.deleteSpawnStmt.run(spawn.guildId, spawn.channelId);
    if (this.spawnTimers.has(key)) {
      clearTimeout(this.spawnTimers.get(key));
      this.spawnTimers.delete(key);
    }

    this.insertCaptureStmt.run(
      spawn.guildId,
      interaction.user.id,
      spawn.pokemonId,
      spawn.pokemonDisplay,
      spawn.pokemonRaw,
      spawn.spriteUrl,
      Date.now(),
    );

    await this.updateSpawnMessage(spawn, {
      title: `${spawn.pokemonDisplay} was caught!`,
      description: `Caught by ${interaction.user}.`,
      color: 0x06D6A0,
    });

    try {
      if (interaction.channel?.isTextBased?.()) {
        await interaction.channel.send({
          content: `?? ${interaction.user} caught **${spawn.pokemonDisplay}**!`
        });
      }
    } catch {}

    await interaction.editReply(`Nice catch! You added **${spawn.pokemonDisplay}** to your collection.`);
  }

  async handleHint(interaction) {
    if (!this.ready) {
      await interaction.reply({ content: 'Pokemon module is still initialising, try again shortly.', ephemeral: true });
      return;
    }
    if (!interaction.guild) {
      await interaction.reply({ content: 'Hints only work inside a server channel.', ephemeral: true });
      return;
    }
    const key = this.key(interaction.guild.id, interaction.channelId);
    const spawn = this.activeSpawns.get(key);
    if (!spawn) {
      await interaction.reply({ content: 'No wild Pokemon is active right now. Chat more to draw one out!', ephemeral: true });
      return;
    }
    await interaction.reply({ content: `Hint: ${spawn.hint}`, ephemeral: true });
  }

  async handleStats(interaction) {
    if (!this.ready) {
      await interaction.reply({ content: 'Pokemon module is still initialising, try again shortly.', ephemeral: true });
      return;
    }
    if (!interaction.guild) {
      await interaction.reply({ content: 'Stats are only tracked inside servers.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    const total = this.countCapturesStmt.get(guildId, userId)?.total || 0;
    const unique = this.countUniqueStmt.get(guildId, userId)?.total || 0;
    const recent = this.recentCaptureStmt.get(guildId, userId);
    const userTop = this.userTopStmt.all(guildId, userId);
    const guildTop = this.guildTopStmt.all(guildId);

    const embed = new EmbedBuilder()
      .setColor(0x6C5CE7)
      .setTitle(`${interaction.user.username}'s Pokemon stats`)
      .setDescription('Keep chatting to encounter more Pokemon. Be the quickest to catch them!')
      .addFields(
        {
          name: 'Collection',
          value: `Total caught: **${total}**\nUnique species: **${unique}**`,
          inline: true,
        },
        {
          name: 'Recent',
          value: recent
            ? `Last catch: **${recent.pokemon_display}** <t:${Math.floor(recent.captured_at / 1000)}:R>`
            : 'No catches yet. Start with `/pokemon hint` when a wild Pokemon spawns!',
          inline: true,
        },
      );

    const topLines = userTop.map((row, idx) => `${idx + 1}. ${row.pokemon_display} — ${row.total}`);
    embed.addFields({
      name: 'Your top catches',
      value: topLines.length ? topLines.join('\n') : 'Catch some Pokemon to build your collection!',
      inline: false,
    });

    const guildLines = [];
    for (let i = 0; i < guildTop.length; i += 1) {
      const row = guildTop[i];
      let name = `Trainer ${row.user_id}`;
      try {
        const member = await interaction.guild.members.fetch(row.user_id);
        name = member.displayName;
      } catch {}
      guildLines.push(`${i + 1}. ${name} — ${row.total}`);
    }

    embed.addFields({
      name: 'Top trainers',
      value: guildLines.length ? guildLines.join('\n') : 'No captures yet. Be the first to catch a Pokemon!',
      inline: false,
    });

    await interaction.editReply({ embeds: [embed] });
  }

  getConfig() {
    return {
      spawnChance: this.spawnChance,
      spawnCooldownSeconds: Math.round(this.spawnCooldownMs / 100) / 10,
      despawnSeconds: Math.round(this.despawnMs / 100) / 10,
      maxPokemonId: this.maxPokemonId,
    };
  }

  updateConfig({ spawnChance, spawnCooldownSeconds, despawnSeconds, maxId }) {
    const updates = {};
    if (typeof spawnChance === 'number') {
      const val = clamp(spawnChance, 0.001, 0.25);
      this.spawnChance = val;
      updates.spawnChance = val;
    }
    if (typeof spawnCooldownSeconds === 'number') {
      const seconds = Math.max(5, spawnCooldownSeconds);
      this.spawnCooldownMs = seconds * 1000;
      updates.spawnCooldownSeconds = seconds;
    }
    if (typeof despawnSeconds === 'number') {
      const seconds = Math.max(30, despawnSeconds);
      this.despawnMs = seconds * 1000;
      updates.despawnSeconds = seconds;
    }
    if (typeof maxId === 'number') {
      const val = Math.max(1, Math.min(Math.floor(maxId), 1010));
      this.maxPokemonId = val;
      updates.maxPokemonId = val;
    }
    if (Object.keys(updates).length) {
      logger.info('Pokemon config updated', updates);
    }
    return this.getConfig();
  }

  resetConfig() {
    if (!this.baseConfig) return this.getConfig();
    this.spawnChance = this.baseConfig.spawnChance;
    this.spawnCooldownMs = this.baseConfig.spawnCooldownMs;
    this.despawnMs = this.baseConfig.despawnMs;
    this.maxPokemonId = this.baseConfig.maxPokemonId;
    logger.info('Pokemon config reset to defaults');
    return this.getConfig();
  }

  async getRandomPokemon() {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const id = 1 + Math.floor(Math.random() * this.maxPokemonId);
      try {
        const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const rawName = data.name;
        const displayName = prettifyName(rawName);
        const sprite = data.sprites?.other?.['official-artwork']?.front_default || data.sprites?.front_default || null;
        const types = data.types?.map((entry) => entry.type?.name).filter(Boolean) || [];
        if (!sprite) {
          logger.warn(`No sprite for pokemon id ${id}, retrying`);
          continue;
        }
        return {
          id,
          rawName,
          displayName,
          spriteUrl: sprite,
          types,
        };
      } catch (error) {
        logger.warn(`Failed to fetch pokemon id ${id}`, error);
      }
    }
    return null;
  }

  buildHint(info) {
    const letters = info.displayName.replace(/[^A-Za-z0-9]/g, '').length;
    const first = info.displayName.charAt(0).toUpperCase();
    const typeText = info.types.length ? info.types.map((t) => capitalize(t)).join('/') : 'Unknown';
    return `Types: ${typeText} | Letters: ${letters} | Starts with: ${first}`;
  }

  buildSpawnEmbed(spawn) {
    return new EmbedBuilder()
      .setColor(0x6C5CE7)
      .setTitle('A wild Pokemon appeared!')
      .setDescription('Use `/pokemon catch name:<guess>` to capture it. Need help? Try `/pokemon hint` for a clue.')
      .setImage(spawn.spriteUrl)
      .setFooter({ text: `Despawns in ${Math.floor(this.despawnMs / 1000)} seconds.` });
  }

  async updateSpawnMessage(spawn, { title, description, color }) {
    try {
      const channel = await this.fetchChannel(spawn.channelId);
      if (!channel?.isTextBased?.()) return;
      const message = await channel.messages.fetch(spawn.messageId).catch(() => null);
      if (!message) return;
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setImage(spawn.spriteUrl)
        .setTimestamp(new Date());
      await message.edit({ embeds: [embed], components: [] });
    } catch (error) {
      logger.warn('Failed to edit pokemon spawn message', error);
    }
  }

  async fetchChannel(channelId) {
    if (this.client.channels.cache.has(channelId)) {
      return this.client.channels.cache.get(channelId);
    }
    try {
      return await this.client.channels.fetch(channelId);
    } catch {
      return null;
    }
  }
}

export const pokemonService = new PokemonService();
export const initPokemon = (client, db) => pokemonService.init(client, db);
export const handlePokemonMessage = (message) => pokemonService.handleMessage(message);
export const getPokemonConfig = () => pokemonService.getConfig();
export const updatePokemonConfig = (changes) => pokemonService.updateConfig(changes);
export const resetPokemonConfig = () => pokemonService.resetConfig();

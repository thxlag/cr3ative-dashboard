import { SlashCommandBuilder } from 'discord.js';
import { getDB } from '../../lib/db.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { isAdmin } from '../../utils/perm.js';
import { levelFromTotalXp, xpToNextLevel } from '../../utils/leveling.js';

function totalXpForLevel(n){
  let sum = 0;
  for (let i = 0; i < n; i++) sum += xpToNextLevel(i);
  return sum;
}

export default {
  data: new SlashCommandBuilder()
    .setName('leveladmin')
    .setDescription('Admin: minimal level controls & setup')
    .addSubcommand(s =>
      s.setName('set-levelups-channel')
       .setDescription('Set the #level-ups channel used when members choose "on"')
       .addChannelOption(o=>o.setName('channel').setDescription('Text channel').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('set-clips-channel')
       .setDescription('Set the #clips channel used for DM mode')
       .addChannelOption(o=>o.setName('channel').setDescription('Text channel').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('set-level')
       .setDescription('Set a user to an exact level')
       .addUserOption(o=>o.setName('user').setDescription('Target user').setRequired(true))
       .addIntegerOption(o=>o.setName('level').setDescription('Level >= 0').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('add-xp')
       .setDescription('Add XP to a user')
       .addUserOption(o=>o.setName('user').setDescription('Target user').setRequired(true))
       .addIntegerOption(o=>o.setName('amount').setDescription('XP to add (>0)').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('remove-xp')
       .setDescription('Remove XP from a user')
       .addUserOption(o=>o.setName('user').setDescription('Target user').setRequired(true))
       .addIntegerOption(o=>o.setName('amount').setDescription('XP to remove (>0)').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('reset')
       .setDescription('Reset a user to 0 XP')
       .addUserOption(o=>o.setName('user').setDescription('Target user').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('view')
       .setDescription('Show current server level settings')
    ),
  async execute(interaction){
    if (!isAdmin(interaction)) {
      return interaction.reply({ content: 'You do not have permission to use this.', flags: EPHEMERAL });
    }
    const db = getDB();
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    switch(sub){
      case 'set-levelups-channel': {
        const ch = interaction.options.getChannel('channel');
        db.prepare(`
          INSERT INTO level_guild_settings (guild_id, levelups_channel_id)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET levelups_channel_id=excluded.levelups_channel_id
        `).run(guildId, ch.id);
        return interaction.reply({ content: `Set level-ups channel to ${ch}.`, flags: EPHEMERAL });
      }
      case 'set-clips-channel': {
        const ch = interaction.options.getChannel('channel');
        db.prepare(`
          INSERT INTO level_guild_settings (guild_id, clips_channel_id)
          VALUES (?, ?)
          ON CONFLICT(guild_id) DO UPDATE SET clips_channel_id=excluded.clips_channel_id
        `).run(guildId, ch.id);
        return interaction.reply({ content: `Set clips channel to ${ch}.`, flags: EPHEMERAL });
      }
      case 'set-level': {
        const user = interaction.options.getUser('user');
        const level = interaction.options.getInteger('level');
        if (level < 0) return interaction.reply({ content: 'Level must be ≥ 0.', flags: EPHEMERAL });
        const xp = totalXpForLevel(level);
        // upsert
        const row = db.prepare('SELECT xp FROM levels WHERE guild_id = ? AND user_id = ?').get(guildId, user.id);
        if (row) {
          db.prepare('UPDATE levels SET xp = ? WHERE guild_id = ? AND user_id = ?').run(xp, guildId, user.id);
        } else {
          db.prepare('INSERT INTO levels (guild_id, user_id, xp) VALUES (?, ?, ?)').run(guildId, user.id, xp);
        }
        return interaction.reply({ content: `Set ${user} to **Level ${level}** (${xp} XP).`, flags: EPHEMERAL });
      }
      case 'add-xp': {
        const user = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        if (amount <= 0) return interaction.reply({ content: 'Amount must be > 0.', flags: EPHEMERAL });
        const row = db.prepare('SELECT xp FROM levels WHERE guild_id = ? AND user_id = ?').get(guildId, user.id) || { xp: 0 };
        const newXp = row.xp + amount;
        db.prepare('INSERT INTO levels (guild_id,user_id,xp) VALUES (?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET xp=excluded.xp')
          .run(guildId, user.id, newXp);
        const lv = levelFromTotalXp(newXp).level;
        return interaction.reply({ content: `Added **${amount}** XP to ${user}. Now **Level ${lv}** (${newXp} XP).`, flags: EPHEMERAL });
      }
      case 'remove-xp': {
        const user = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        if (amount <= 0) return interaction.reply({ content: 'Amount must be > 0.', flags: EPHEMERAL });
        const row = db.prepare('SELECT xp FROM levels WHERE guild_id = ? AND user_id = ?').get(guildId, user.id) || { xp: 0 };
        const newXp = Math.max(0, row.xp - amount);
        db.prepare('INSERT INTO levels (guild_id,user_id,xp) VALUES (?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET xp=excluded.xp')
          .run(guildId, user.id, newXp);
        const lv = levelFromTotalXp(newXp).level;
        return interaction.reply({ content: `Removed **${amount}** XP from ${user}. Now **Level ${lv}** (${newXp} XP).`, flags: EPHEMERAL });
      }
      case 'reset': {
        const user = interaction.options.getUser('user');
        db.prepare('INSERT INTO levels (guild_id,user_id,xp) VALUES (?,?,0) ON CONFLICT(guild_id,user_id) DO UPDATE SET xp=0')
          .run(guildId, user.id);
        return interaction.reply({ content: `Reset ${user} to **Level 0** (0 XP).`, flags: EPHEMERAL });
      }
      case 'view': {
        const gs = db.prepare('SELECT levelups_channel_id, clips_channel_id, throttle_sec FROM level_guild_settings WHERE guild_id = ?').get(guildId) || {};
        const ch = gs.levelups_channel_id ? `<#${gs.levelups_channel_id}>` : '(auto: #level-ups if present)';
        const clips = gs.clips_channel_id ? `<#${gs.clips_channel_id}>` : '(not set)';
        return interaction.reply({
          content: [
            `Level-ups channel: ${ch}`,
            `Clips channel (DM mode): ${clips}`,
            `Ping throttle: ${gs.throttle_sec ?? 30}s`,
          ].join('\n'),
          flags: EPHEMERAL
        });
      }
    }
  }
}

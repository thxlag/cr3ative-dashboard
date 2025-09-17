import { SlashCommandBuilder } from 'discord.js';
import { getDB } from '../../lib/db.js';
import { EPHEMERAL } from '../../utils/flags.js';

export default {
  data: new SlashCommandBuilder()
    .setName('levelsettings')
    .setDescription('Personal level-up notification settings')
    .addSubcommand(s =>
      s.setName('pings')
       .setDescription('Choose how you want to get level-up messages')
       .addStringOption(o =>
         o.setName('mode')
          .setDescription('off = none, on = server default (#level-ups), announce = here, dm = DM me')
          .setRequired(true)
          .addChoices(
            { name: 'off (no messages)', value: 'off' },
            { name: 'on (server default)', value: 'on' },
            { name: 'announce (here)', value: 'announce' },
            { name: 'dm (with clip if set)', value: 'dm' },
          )
       )
    )
    .addSubcommand(s =>
      s.setName('view')
       .setDescription('View your current level-up settings')
    ),
  async execute(interaction){
    const db = getDB();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    const sub = interaction.options.getSubcommand();

    if (sub === 'pings'){
      const mode = interaction.options.getString('mode');
      db.prepare(`
        INSERT INTO level_user_prefs (guild_id, user_id, mode)
        VALUES (?, ?, ?)
        ON CONFLICT(guild_id, user_id) DO UPDATE SET mode=excluded.mode
      `).run(guildId, userId, mode);

      return interaction.reply({ content: `Saved. Your level-up messages are set to **${mode}**.`, flags: EPHEMERAL });
    }

    if (sub === 'view'){
      const pref = db.prepare('SELECT mode FROM level_user_prefs WHERE guild_id = ? AND user_id = ?').get(guildId, userId) || { mode: 'on' };
      const gs = db.prepare('SELECT levelups_channel_id, clips_channel_id, throttle_sec FROM level_guild_settings WHERE guild_id = ?').get(guildId) || {};
      const ch = gs.levelups_channel_id ? `<#${gs.levelups_channel_id}>` : '(auto: #level-ups if present)';
      const clips = gs.clips_channel_id ? `<#${gs.clips_channel_id}>` : '(not set)';
      return interaction.reply({
        content: [
          `Your mode: **${pref.mode}**`,
          `Server default channel (used for "on"): ${ch}`,
          `Clips channel (used for "dm"): ${clips}`,
          `Ping throttle: ${gs.throttle_sec ?? 30}s`,
        ].join('\n'),
        flags: EPHEMERAL
      });
    }
  }
}

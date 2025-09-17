import { SlashCommandBuilder } from 'discord.js';
import { getDB } from '../../lib/db.js';
import { levelFromTotalXp } from '../../utils/leveling.js';
import { baseEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Show your level and progress')
    .addUserOption(o => o.setName('user').setDescription('Another user').setRequired(false)),
  async execute(interaction){
    const user = interaction.options.getUser('user') || interaction.user;
    const guildId = interaction.guildId;
    const db = getDB();

    const row = db.prepare('SELECT xp FROM levels WHERE guild_id = ? AND user_id = ?')
      .get(guildId, user.id) || { xp: 0 };
    const total = row.xp || 0;
    const state = levelFromTotalXp(total);

    const barLen = 20;
    const filled = Math.round(state.progress * barLen);
    const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);

    const rank = (db.prepare('SELECT COUNT(*) AS c FROM levels WHERE guild_id = ? AND xp > ?')
      .get(guildId, total).c || 0) + 1;
    const population = db.prepare('SELECT COUNT(*) AS c FROM levels WHERE guild_id = ?').get(guildId).c || 1;

    const embed = baseEmbed({ title: `${user.username} • Level ${state.level}`, color: 'info' })
      .setDescription([
        `XP: **${total}**`,
        `Next level in **${state.next - state.current}** XP`,
        `\`${bar}\` (${Math.floor(state.progress * 100)}%)`,
        `Rank: **#${rank}** of ${population}`
      ].join('\n'));

    await interaction.reply({ embeds: [embed] });
  }
}

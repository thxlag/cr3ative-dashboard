import { SlashCommandBuilder } from 'discord.js';
import { getDB } from '../../lib/db.js';
import { levelFromTotalXp } from '../../utils/leveling.js';
import { baseEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('levelleaderboard')
    .setDescription('Server leveling leaderboard (top 10)'),
  async execute(interaction){
    const guildId = interaction.guildId;
    const db = getDB();
    const rows = db.prepare('SELECT user_id, xp FROM levels WHERE guild_id = ? ORDER BY xp DESC LIMIT 10')
      .all(guildId);

    if (!rows.length) return interaction.reply('No one has any XP yet.');

    const lines = rows.map((r, i) => {
      const st = levelFromTotalXp(r.xp);
      return `**${i+1}.** <@${r.user_id}> — Level **${st.level}** • ${r.xp} XP`;
    });

    const embed = baseEmbed({ title: `${interaction.guild.name} • Level Leaderboard`, color: 'info' })
      .setDescription(lines.join('\n'));

    await interaction.reply({ embeds: [embed] });
  }
}

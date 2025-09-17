import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDB } from '../../lib/db.js';
import { levelFromTotalXp } from '../../utils/leveling.js';

export default {
  data: new SlashCommandBuilder()
    .setName('levelprofile')
    .setDescription('Level profile (includes daily streak)')
    .addUserOption(o => o.setName('user').setDescription('Another user').setRequired(false)),
  async execute(interaction){
    const user = interaction.options.getUser('user') || interaction.user;
    const guildId = interaction.guildId;
    const db = getDB();

    const lv = db.prepare('SELECT xp FROM levels WHERE guild_id = ? AND user_id = ?')
      .get(guildId, user.id) || { xp: 0 };
    const st = levelFromTotalXp(lv.xp);

    const eco = db.prepare('SELECT streak FROM users WHERE user_id = ?').get(user.id) || { streak: 0 };

    const barLen = 20;
    const filled = Math.round(st.progress * barLen);
    const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);

    const embed = new EmbedBuilder()
      .setTitle(`${user.username} • Level Profile`)
      .addFields(
        { name: 'Level', value: String(st.level), inline: true },
        { name: 'Total XP', value: String(lv.xp || 0), inline: true },
        { name: 'Daily Streak', value: String(eco.streak || 0), inline: true },
      )
      .setDescription([
        `Progress to next: **${Math.floor(st.progress * 100)}%**`,
        `\`${bar}\``,
        `Next level in **${st.next - st.current}** XP`
      ].join('\n'));

    await interaction.reply({ embeds: [embed] });
  }
}

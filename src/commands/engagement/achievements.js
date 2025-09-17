import { SlashCommandBuilder } from 'discord.js';
import { ACHIEVEMENTS, listAchievements } from '../../utils/achievements.js';
import { baseEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('View your achievements')
    .addUserOption(o => o.setName('user').setDescription('Another user').setRequired(false)),
  async execute(interaction){
    const target = interaction.options.getUser('user') || interaction.user;
    const guildId = interaction.guildId;
    const rows = listAchievements(guildId, target.id);
    const unlocked = new Set(rows.map(r => r.key));
    const allKeys = Object.keys(ACHIEVEMENTS);
    const linesUnlocked = rows.map(r => `🏆 ${ACHIEVEMENTS[r.key]?.name || r.key} — <t:${Math.floor(r.earned_at/1000)}:R>`);
    const linesLocked = allKeys.filter(k => !unlocked.has(k)).map(k => `🔒 ${ACHIEVEMENTS[k].name} — ${ACHIEVEMENTS[k].desc}`);
    const embed = baseEmbed({ title: `${target.username} • Achievements`, color: 'info' })
      .setDescription([linesUnlocked.join('\n') || 'No achievements yet.', '', '**Locked**', linesLocked.join('\n') || 'All unlocked!'].join('\n'));
    await interaction.reply({ embeds: [embed] });
  }
}

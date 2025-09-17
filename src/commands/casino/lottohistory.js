import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDB } from '../../lib/db.js';

export default {
  data: new SlashCommandBuilder().setName('lottohistory').setDescription('Show recent lottery winners'),
  async execute(interaction){
    const db = getDB();
    const rows = db.prepare('SELECT user_id, amount, at_ts FROM lottery_wins WHERE guild_id = ? ORDER BY at_ts DESC LIMIT 10').all(interaction.guildId);
    if (!rows.length) return interaction.reply('no lottery winners yet.');
    const lines = rows.map(r => `• <@${r.user_id}> — **${r.amount}** • <t:${Math.floor(r.at_ts/1000)}:R>`);
    const embed = new EmbedBuilder().setTitle('🎟️ Lottery — Recent Winners').setDescription(lines.join('\n')).setTimestamp(Date.now());
    return interaction.reply({ embeds: [embed] });
  }
}

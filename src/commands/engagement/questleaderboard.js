import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDB } from '../../lib/db.js';

const DAY = 24*60*60*1000;

function cutoff(period){
  if (period === '7d') return Date.now() - 7*DAY;
  if (period === '30d') return Date.now() - 30*DAY;
  return null;
}

export default {
  data: new SlashCommandBuilder()
    .setName('questleaderboard')
    .setDescription('Show quest points leaderboard')
    .addStringOption(o => o.setName('period').setDescription('Time window').addChoices(
      { name: 'all-time', value: 'all' },
      { name: 'last 7 days', value: '7d' },
      { name: 'last 30 days', value: '30d' },
    )),
  async execute(interaction){
    const period = interaction.options.getString('period') || '7d';
    const db = getDB();
    const guildId = interaction.guildId;
    const since = cutoff(period);
    const rows = since ? db.prepare(`
      SELECT user_id, SUM(points) AS pts
      FROM quest_claims
      WHERE guild_id = ? AND at_ts >= ?
      GROUP BY user_id
      ORDER BY pts DESC
      LIMIT 10
    `).all(guildId, since) : db.prepare(`
      SELECT user_id, SUM(points) AS pts
      FROM quest_claims
      WHERE guild_id = ?
      GROUP BY user_id
      ORDER BY pts DESC
      LIMIT 10
    `).all(guildId);

    if (!rows.length) return interaction.reply('No quest points yet. Complete quests with /quests!');
    const lines = rows.map((r,i)=> `**${i+1}.** <@${r.user_id}> — **${r.pts}** pts`);
    const embed = new EmbedBuilder().setTitle('🏅 Quest Points Leaderboard').setDescription(lines.join('\n')).setTimestamp(Date.now());
    await interaction.reply({ embeds: [embed] });
  }
}


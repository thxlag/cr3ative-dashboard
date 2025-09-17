import { SlashCommandBuilder } from 'discord.js';
import { getDB } from '../../lib/db.js';
import { baseEmbed } from '../../utils/embeds.js';
import { safeReply } from '../../utils/interactions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('transactions')
    .setDescription('Show your recent economy transactions')
    .addIntegerOption(o => o.setName('limit').setDescription('How many (max 20)').setRequired(false)),
  async execute(interaction){
    const limit = Math.min(Math.max(interaction.options.getInteger('limit') || 10, 1), 20);
    const db = getDB();
    const rows = db.prepare('SELECT amount, type, reason, created_at FROM txns WHERE user_id = ? ORDER BY id DESC LIMIT ?')
      .all(interaction.user.id, limit);

    if (!rows.length) return safeReply(interaction, 'no transactions yet.');

    const lines = rows.map(r => {
      const when = new Date(r.created_at).toLocaleString();
      const amt = r.amount >= 0 ? `+${r.amount}` : `${r.amount}`;
      const why = r.reason ? ` • ${r.reason}` : '';
      return `\`${when}\` • **${amt}** • ${r.type}${why}`;
    });

    const embed = baseEmbed({ title: `${interaction.user.username} • Recent Transactions`, color: 'info' })
      .setDescription(lines.join('\n'));

    await safeReply(interaction, { embeds: [embed] });
  }
}

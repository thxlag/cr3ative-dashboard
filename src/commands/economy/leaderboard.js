import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDB } from '../../lib/db.js';
import { safeReply } from '../../utils/interactions.js';
import { levelFromTotalXp } from '../../utils/leveling.js';

const DAY = 24 * 60 * 60 * 1000;

function cutoffFromPeriod(period){
  const now = Date.now();
  if (period === '7d') return now - 7 * DAY;
  if (period === '30d') return now - 30 * DAY;
  return null; // all-time
}

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show a leaderboard by type')
    .addStringOption(o =>
      o.setName('type')
       .setDescription('Which leaderboard to view')
       .setRequired(true)
       .addChoices(
         { name: 'coins (richest)', value: 'coins' },
         { name: 'xp (levels)',     value: 'xp' },
         { name: 'lottery (top single win)', value: 'lottery' },
         { name: 'events (by name)', value: 'events' },
         { name: 'crime (most stolen)', value: 'crime' },
       )
    )
    .addStringOption(o =>
      o.setName('period')
       .setDescription('Time window (applies to lottery/events)')
       .addChoices(
         { name: 'all-time', value: 'all' },
         { name: 'last 7 days', value: '7d' },
         { name: 'last 30 days', value: '30d' },
       )
    )
    .addStringOption(o =>
      o.setName('event')
       .setDescription('Event name (required when type=events)')
    )
    .addIntegerOption(o =>
      o.setName('limit')
       .setDescription('How many to show (max 20)')
    ),
  async execute(interaction){
    const db = getDB();
    const guildId = interaction.guildId;
    const type = interaction.options.getString('type');
    const period = interaction.options.getString('period') || 'all';
    const eventName = interaction.options.getString('event') || null;
    const limit = Math.min(Math.max(interaction.options.getInteger('limit') || 10, 1), 20);

    let title = '';
    let lines = [];
    let footer = null;

    if (type === 'coins') {
      // global economy (wallet+bank). If you ever make econ per-guild, adjust schema here.
      const rows = db.prepare(`
        SELECT user_id, (wallet + bank) AS total
        FROM users
        ORDER BY total DESC
        LIMIT ?
      `).all(limit);

      if (!rows.length) return safeReply(interaction, 'no coin data yet.');

      lines = rows.map((r, i) => `**${i+1}.** <@${r.user_id}> — **${r.total}** coins`);
      title = '💰 Coins — Top Richest (global)';
      footer = 'Tip: deposit coins to protect them.';
    }

    else if (type === 'xp') {
      const rows = db.prepare(`
        SELECT user_id, xp
        FROM levels
        WHERE guild_id = ?
        ORDER BY xp DESC
        LIMIT ?
      `).all(guildId, limit);

      if (!rows.length) return safeReply(interaction, 'no XP yet in this server.');

      lines = rows.map((r, i) => {
        const st = levelFromTotalXp(r.xp);
        return `**${i+1}.** <@${r.user_id}> — Level **${st.level}** • ${r.xp} XP`;
      });
      title = '🧪 XP — Server Leaderboard';
      footer = 'XP is all-time. Use events/lottery for time-scoped boards.';
    }

    else if (type === 'lottery') {
      const since = cutoffFromPeriod(period);
      const rows = since
        ? db.prepare(`
            SELECT user_id, MAX(amount) as best_win
            FROM lottery_wins
            WHERE guild_id = ? AND at_ts >= ?
            GROUP BY user_id
            ORDER BY best_win DESC
            LIMIT ?
          `).all(guildId, since, limit)
        : db.prepare(`
            SELECT user_id, MAX(amount) as best_win
            FROM lottery_wins
            WHERE guild_id = ?
            GROUP BY user_id
            ORDER BY best_win DESC
            LIMIT ?
          `).all(guildId, limit);

      if (!rows.length) return safeReply(interaction, 'no lottery wins recorded yet.');

      lines = rows.map((r, i) => `**${i+1}.** <@${r.user_id}> — biggest win **${r.best_win}**`);
      title = '🎟️ Lottery — Top Single Wins';
      footer = period === 'all' ? 'All-time' : `Period: ${period}`;
    }

    else if (type === 'events') {
      if (!eventName) {
        return safeReply(interaction, { content: 'provide an **event** name for events leaderboard, e.g. `/leaderboard type:events event:"Summer Event"`', flags: 64 });
      }
      const since = cutoffFromPeriod(period);
      const rows = since
        ? db.prepare(`
            SELECT user_id, SUM(score) AS total_score
            FROM event_results
            WHERE guild_id = ? AND event_name = ? AND at_ts >= ?
            GROUP BY user_id
            ORDER BY total_score DESC
            LIMIT ?
          `).all(guildId, eventName, since, limit)
        : db.prepare(`
            SELECT user_id, SUM(score) AS total_score
            FROM event_results
            WHERE guild_id = ? AND event_name = ?
            GROUP BY user_id
            ORDER BY total_score DESC
            LIMIT ?
          `).all(guildId, eventName, limit);

      if (!rows.length) return safeReply(interaction, `no results yet for **${eventName}**.`);

      lines = rows.map((r, i) => `**${i+1}.** <@${r.user_id}> — **${r.total_score}** pts`);
      title = `🏆 Event — ${eventName}`;
      footer = period === 'all' ? 'All-time' : `Period: ${period}`;
    }

    else if (type === 'crime') {
      const since = cutoffFromPeriod(period);
      // Sum robbery_gain txns within period
      const rows = since
        ? db.prepare(`
            SELECT user_id, SUM(amount) AS stolen
            FROM txns
            WHERE created_at >= ? AND reason = 'robbery_gain'
            GROUP BY user_id
            ORDER BY stolen DESC
            LIMIT ?
          `).all(since, limit)
        : db.prepare(`
            SELECT user_id, SUM(amount) AS stolen
            FROM txns
            WHERE reason = 'robbery_gain'
            GROUP BY user_id
            ORDER BY stolen DESC
            LIMIT ?
          `).all(limit);

      if (!rows.length) return safeReply(interaction, 'no robbery gains yet.');

      lines = rows.map((r, i) => `**${i+1}.** <@${r.user_id}> — **${r.stolen || 0}** stolen`);
      title = period === 'all' ? '🕵️ Crime — Most Stolen (all-time)' : `🕵️ Crime — Most Stolen (${period})`;
      footer = null;
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(lines.join('\n'))
      .setTimestamp(Date.now());
    if (footer) embed.setFooter({ text: footer });

    await safeReply(interaction, { embeds: [embed] });
  }
}

import { SlashCommandBuilder } from 'discord.js';
import { getDB } from '../../lib/db.js';
import { baseEmbed } from '../../utils/embeds.js';
import { safeReply } from '../../utils/interactions.js';

function fmt(n){ return Number(n || 0).toLocaleString(); }
function pct(n){ return isFinite(n) ? `${(n*100).toFixed(1)}%` : '0.0%'; }
function timeAgo(ts){
  if (!ts) return 'never';
  const ms = Math.max(0, Date.now() - Number(ts));
  const s = Math.floor(ms/1000);
  const d = Math.floor(s/86400);
  const h = Math.floor((s%86400)/3600);
  const m = Math.floor((s%3600)/60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m && parts.length < 2) parts.push(`${m}m`);
  if (!parts.length) parts.push(`${s%60}s`);
  return parts.join(' ') + ' ago';
}

export default {
  data: new SlashCommandBuilder()
    .setName('casinostats')
    .setDescription('View your casino stats (slots for now)')
  ,
  async execute(interaction){
    const userId = interaction.user.id;
    const db = getDB();

    // Aggregate slots stats from txns table
    const bets = db.prepare(`
      SELECT COUNT(*) AS spins, COALESCE(SUM(amount), 0) AS sum_amount, MAX(created_at) AS last_ts
      FROM txns WHERE user_id = ? AND reason = 'slots_bet'
    `).get(userId) || { spins: 0, sum_amount: 0, last_ts: 0 };
    const wins = db.prepare(`
      SELECT COUNT(*) AS wins, COALESCE(SUM(amount), 0) AS sum_win, COALESCE(MAX(amount), 0) AS best_win
      FROM txns WHERE user_id = ? AND reason = 'slots_win'
    `).get(userId) || { wins: 0, sum_win: 0, best_win: 0 };

    const spins = Number(bets.spins || 0);
    const wagered = Math.abs(Number(bets.sum_amount || 0)); // bets are negative entries
    const totalWon = Number(wins.sum_win || 0);
    const winSpins = Number(wins.wins || 0);
    const bestWin = Number(wins.best_win || 0);
    const net = totalWon - wagered;
    const winRate = spins > 0 ? (winSpins / spins) : 0;
    const rtp = wagered > 0 ? (totalWon / wagered) : 0;

    const embed = baseEmbed({ title: `${interaction.user.username} • Casino Stats`, color: 'info' });
    embed.addFields(
      { name: '🎰 Slots', value: [
        `Spins: **${fmt(spins)}**`,
        `Wins: **${fmt(winSpins)}** • Win Rate: **${pct(winRate)}**`,
        `Total Wagered: **${fmt(wagered)}**`,
        `Total Won: **${fmt(totalWon)}**`,
        `Net: **${net >= 0 ? '+'+fmt(net) : '-' + fmt(Math.abs(net))}**`,
        `Best Single Win: **${fmt(bestWin)}**`,
        `Last Played: **${timeAgo(bets.last_ts)}**`,
      ].join('\n') },
      { name: 'Other Games', value: 'Coming soon…', inline: false },
    );

    return safeReply(interaction, { embeds: [embed] });
  }
}

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDB } from '../../lib/db.js';
import { getUser } from '../../lib/econ.js';
import { safeReply } from '../../utils/interactions.js';

const BASE = 250;
const STREAK_STEP = 50;
const STREAK_CAP = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

function human(ms){
  const s = Math.max(0, Math.ceil(ms/1000));
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  const ss = s%60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${ss}s`;
  return `${ss}s`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('streak')
    .setDescription('Show your daily streak and next bonus'),
  async execute(interaction){
    const userId = interaction.user.id;
    const db = getDB();
    const u = getUser(userId); // ensures row

    const meta = db.prepare('SELECT streak, last_claim_day FROM users WHERE user_id = ?')
      .get(userId) || { streak: 0, last_claim_day: null };

    const remaining = u.last_daily + DAY_MS - Date.now();
    const available = remaining <= 0;

    const currentStreak = meta.streak || 0;
    const nextBonus = Math.min(STREAK_STEP * (currentStreak + 1), STREAK_CAP);

    const embed = new EmbedBuilder()
      .setTitle(`${interaction.user.username} • Daily Streak`)
      .addFields(
        { name: 'Current streak', value: String(currentStreak), inline: true },
        { name: 'Today’s base', value: String(BASE), inline: true },
        { name: 'Next bonus (if kept)', value: `+${nextBonus}`, inline: true },
      )
      .setFooter({ text: available ? 'You can claim now with /daily' : `Next claim in ~${human(remaining)}` });

    await safeReply(interaction, { embeds: [embed] });
  }
}

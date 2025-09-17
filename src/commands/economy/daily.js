import { SlashCommandBuilder } from 'discord.js';
import { getDB } from '../../lib/db.js';
import { getUser, incWallet, setLastDaily } from '../../lib/econ.js';
import { EPHEMERAL } from '../../utils/flags.js';
import { safeReply } from '../../utils/interactions.js';
import { incQuest, questMetaByKey } from '../../utils/quests.js';
import { incBurstMetric } from '../../utils/events.js';
import { grantAchievement } from '../../utils/achievements.js';
import { postAchievement } from '../../utils/achievements_feed.js';

const BASE = 250;          // base daily
const STREAK_STEP = 50;    // +50 per day in a row
const STREAK_CAP = 500;    // cap bonus at +500
const DAY_MS = 24 * 60 * 60 * 1000;

function isoDayUTC(d = new Date()) {
  return new Date(d).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}
function isoYesterdayUTC() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return isoDayUTC(d);
}

function ensureStreakColumns(db) {
  const cols = db.prepare('PRAGMA table_info(users)').all();
  const names = new Set(cols.map(c => c.name));
  if (names.has('streak') && names.has('last_claim_day')) return;

  db.exec('BEGIN');
  try {
    if (!names.has('streak')) {
      db.prepare('ALTER TABLE users ADD COLUMN streak INTEGER NOT NULL DEFAULT 0').run();
    }
    if (!names.has('last_claim_day')) {
      db.prepare('ALTER TABLE users ADD COLUMN last_claim_day TEXT').run();
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    // If another process added them between check and alter, we can ignore
    if (!/duplicate column|already exists/i.test(String(e.message))) {
      throw e;
    }
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily reward with a streak bonus'),
  async execute(interaction) {
    const userId = interaction.user.id;
    const db = getDB();

    // ensure streak columns exist (self-heal)
    ensureStreakColumns(db);

    const u = getUser(userId); // ensures base row exists

    // 24h cooldown using last_daily timestamp
    const remaining = u.last_daily + DAY_MS - Date.now();
    if (remaining > 0) {
      const hrs = Math.ceil(remaining / (60 * 60 * 1000));
      return safeReply(interaction, {
        content: `you already claimed. try again in about ${hrs} hour(s).`,
        flags: EPHEMERAL
      });
    }

    // streak metadata
    const meta = db.prepare(
      'SELECT streak, last_claim_day FROM users WHERE user_id = ?'
    ).get(userId) || { streak: 0, last_claim_day: null };

    const today = isoDayUTC();
    const yesterday = isoYesterdayUTC();

    // compute next streak
    let nextStreak = 1;
    if (meta.last_claim_day === yesterday) {
      nextStreak = (meta.streak || 0) + 1;     // continued streak
    } else if (meta.last_claim_day === today) {
      nextStreak = meta.streak || 1;           // same day (shouldn’t happen due to cooldown)
    } else {
      nextStreak = 1;                           // broke or first claim
    }

    const bonus = Math.min(STREAK_STEP * nextStreak, STREAK_CAP);
    const payout = BASE + bonus;

    // apply rewards and update cooldown + streak fields
    incWallet(userId, payout, `daily + streak ${nextStreak}`);
    setLastDaily(userId, Date.now());
    db.prepare(
      'UPDATE users SET streak = ?, last_claim_day = ? WHERE user_id = ?'
    ).run(nextStreak, today, userId);

    await safeReply(interaction, {
      content: `daily claimed **${payout}** (base ${BASE} + streak bonus ${bonus}). streak is **${nextStreak}**.`
    });

    try {
      const r = incQuest(interaction.guildId, userId, 'daily_claim', 1);
      if (r.completedNow) {
        const meta = questMetaByKey('daily_claim');
        try { await interaction.followUp({ content: `Quest ready: **${meta?.name || 'daily_claim'}** — use /quests claim.`, flags: EPHEMERAL }); } catch {}
      }
      if (nextStreak >= 7) {
        const granted = grantAchievement(interaction.guildId, userId, 'streak_7');
        if (granted) await postAchievement(interaction.guild, userId, 'streak_7');
      }
      try { incBurstMetric(interaction.guildId, userId, 'daily', 1); } catch {}
    } catch {}
  }
};

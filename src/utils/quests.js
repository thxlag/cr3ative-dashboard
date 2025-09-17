// src/utils/quests.js
import { getDB } from '../lib/db.js';
import { incWallet } from '../lib/econ.js';
import { addXp } from './leveling.js';

// Built-in quest definitions (static)
export const DAILY_QUESTS = [
  { key: 'daily_msgs',       name: 'Send 20 messages',        description: 'Chat in any channel to progress.', period: 'daily', target: 20, reward_coins: 150, reward_xp: 0 },
  { key: 'daily_work',       name: 'Complete 3 work shifts',  description: 'Use /work with any job.',         period: 'daily', target: 3,  reward_coins: 200, reward_xp: 0 },
  { key: 'daily_claim',      name: 'Claim your daily reward', description: 'Use /daily once today.',          period: 'daily', target: 1,  reward_coins: 150, reward_xp: 0 },
  { key: 'daily_deposit_500',name: 'Deposit 500 coins',       description: 'Use /deposit amount:500 (or more).', period: 'daily', target: 1, reward_coins: 150, reward_xp: 0 },
  { key: 'daily_buy_item',   name: 'Buy 1 shop item',         description: 'Purchase any item from /shop.', period: 'daily', target: 1, reward_coins: 150, reward_xp: 0 },
  { key: 'daily_level_up',   name: 'Level up once',           description: 'Earn enough XP to level up.', period: 'daily', target: 1, reward_coins: 200, reward_xp: 0 },
];

export const WEEKLY_QUESTS = [
  { key: 'weekly_work',        name: 'Complete 20 work shifts', description: 'Use /work throughout the week.', period: 'weekly', target: 20,   reward_coins: 800,  reward_xp: 0 },
  { key: 'weekly_xp',          name: 'Earn 1000 XP',            description: 'Chat actively to earn XP.',     period: 'weekly', target: 1000, reward_coins: 1000, reward_xp: 0 },
  { key: 'weekly_promotions',  name: 'Get 1 job promotion',     description: 'Get promoted by working shifts.', period: 'weekly', target: 1, reward_coins: 600, reward_xp: 0 },
];

export function questMetaByKey(key){
  const pool = [...DAILY_QUESTS, ...WEEKLY_QUESTS];
  return pool.find(q => q.key === key) || null;
}

function pickRandom(arr, count){
  const a = [...arr];
  const out = [];
  while (a.length && out.length < count){
    const i = Math.floor(Math.random()*a.length);
    out.push(a.splice(i,1)[0]);
  }
  return out;
}

function currentDayRef() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

function currentWeekRef() {
  const d = new Date();
  // ISO week: Thursday determines the year
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Set to nearest Thursday: current date + 4 - current day number
  const dayNum = (date.getUTCDay() + 6) % 7; // 0..6, Monday=0
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function ensureQuests(guildId, userId) {
  const db = getDB();
  const dayRef = currentDayRef();
  const weekRef = currentWeekRef();

  // ensure rotation selections exist for this guild/ref
  const dailyCount = Math.max(1, Math.min(Number(process.env.QUESTS_DAILY_COUNT || 2), DAILY_QUESTS.length));
  const weeklyCount = Math.max(1, Math.min(Number(process.env.QUESTS_WEEKLY_COUNT || 1), WEEKLY_QUESTS.length));
  const hasDaily = db.prepare('SELECT 1 FROM quest_rotation WHERE guild_id = ? AND period = ? AND ref = ?').get(guildId, 'daily', dayRef);
  if (!hasDaily){
    const keys = pickRandom(DAILY_QUESTS, dailyCount).map(q => q.key);
    db.prepare('INSERT INTO quest_rotation (guild_id, period, ref, keys) VALUES (?, ?, ?, ?)').run(guildId, 'daily', dayRef, JSON.stringify(keys));
  }
  const hasWeekly = db.prepare('SELECT 1 FROM quest_rotation WHERE guild_id = ? AND period = ? AND ref = ?').get(guildId, 'weekly', weekRef);
  if (!hasWeekly){
    const keys = pickRandom(WEEKLY_QUESTS, weeklyCount).map(q => q.key);
    db.prepare('INSERT INTO quest_rotation (guild_id, period, ref, keys) VALUES (?, ?, ?, ?)').run(guildId, 'weekly', weekRef, JSON.stringify(keys));
  }

  const getKeys = (period, ref) => {
    const row = db.prepare('SELECT keys FROM quest_rotation WHERE guild_id = ? AND period = ? AND ref = ?').get(guildId, period, ref);
    try { return row?.keys ? JSON.parse(row.keys) : []; } catch { return []; }
  };
  const dailyKeys = getKeys('daily', dayRef);
  const weeklyKeys = getKeys('weekly', weekRef);

  const upsert = db.prepare(`
    INSERT INTO quest_progress (guild_id, user_id, quest_key, period, progress, target, reward_coins, reward_xp, claimed, last_reset)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?, 0, ?)
    ON CONFLICT(guild_id, user_id, quest_key) DO NOTHING
  `);
  for (const key of dailyKeys){ const q = DAILY_QUESTS.find(x=>x.key===key); if (q) upsert.run(guildId, userId, q.key, 'daily', q.target, q.reward_coins, q.reward_xp, dayRef); }
  for (const key of weeklyKeys){ const q = WEEKLY_QUESTS.find(x=>x.key===key); if (q) upsert.run(guildId, userId, q.key, 'weekly', q.target, q.reward_coins, q.reward_xp, weekRef); }

  // Reset if period changed
  const rows = db.prepare('SELECT quest_key, period, last_reset FROM quest_progress WHERE guild_id = ? AND user_id = ?').all(guildId, userId);
  const upd = db.prepare('UPDATE quest_progress SET progress = 0, claimed = 0, last_reset = ? WHERE guild_id = ? AND user_id = ? AND period = ?');
  const needsDailyReset = rows.some(r => r.period === 'daily' && r.last_reset !== dayRef);
  const needsWeeklyReset = rows.some(r => r.period === 'weekly' && r.last_reset !== weekRef);
  if (needsDailyReset) upd.run(dayRef, guildId, userId, 'daily');
  if (needsWeeklyReset) upd.run(weekRef, guildId, userId, 'weekly');

  // delete stale quest rows not in the current rotation
  const keep = [...new Set([...dailyKeys, ...weeklyKeys])];
  if (keep.length){
    const placeholders = keep.map(()=>'?').join(',');
    db.prepare(`DELETE FROM quest_progress WHERE guild_id = ? AND user_id = ? AND quest_key NOT IN (${placeholders})`).run(guildId, userId, ...keep);
  } else {
    db.prepare('DELETE FROM quest_progress WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  }
}

export function getQuests(guildId, userId) {
  const db = getDB();
  ensureQuests(guildId, userId);
  const dayRef = currentDayRef();
  const weekRef = currentWeekRef();
  const getKeys = (period, ref) => {
    const row = db.prepare('SELECT keys FROM quest_rotation WHERE guild_id = ? AND period = ? AND ref = ?').get(guildId, period, ref);
    try { return row?.keys ? JSON.parse(row.keys) : []; } catch { return []; }
  };
  const dailyKeys = getKeys('daily', dayRef);
  const weeklyKeys = getKeys('weekly', weekRef);
  const rows = db.prepare('SELECT * FROM quest_progress WHERE guild_id = ? AND user_id = ?').all(guildId, userId);
  const daily = rows.filter(r => r.period === 'daily' && dailyKeys.includes(r.quest_key));
  const weekly = rows.filter(r => r.period === 'weekly' && weeklyKeys.includes(r.quest_key));
  return { daily, weekly };
}

// old incQuest replaced by version returning completion state

export function claimAll(guildId, userId) {
  const db = getDB();
  ensureQuests(guildId, userId);
  const claimable = db.prepare('SELECT * FROM quest_progress WHERE guild_id = ? AND user_id = ? AND progress >= target AND claimed = 0').all(guildId, userId);
  let coins = 0, xp = 0, keys = [];
  for (const q of claimable) {
    coins += q.reward_coins || 0;
    xp += q.reward_xp || 0;
    keys.push(q.quest_key);
  }
  if (!keys.length) return { coins: 0, xp: 0, claimed: [] };
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE quest_progress SET claimed = 1 WHERE guild_id = ? AND user_id = ? AND quest_key IN (' + keys.map(()=>'?').join(',') + ')')
      .run(guildId, userId, ...keys);
    // log claims for leaderboards
    const now = Date.now();
    const pointsFor = (key)=> key.startsWith('daily_') ? 1 : 3;
    const ins = db.prepare('INSERT INTO quest_claims (guild_id, user_id, quest_key, points, at_ts) VALUES (?, ?, ?, ?, ?)');
    for (const key of keys) ins.run(guildId, userId, key, pointsFor(key), now);
    if (coins) incWallet(userId, coins, 'quests_claim');
    if (xp) addXp(guildId, userId, xp);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return { coins: 0, xp: 0, claimed: [] };
  }
  return { coins, xp, claimed: keys };
}

// Increment quest progress and indicate if any became ready
export function incQuest(guildId, userId, key, amount = 1) {
  const db = getDB();
  ensureQuests(guildId, userId);
  const row = db.prepare('SELECT progress, target, claimed FROM quest_progress WHERE guild_id = ? AND user_id = ? AND quest_key = ?').get(guildId, userId, key);
  if (!row) return { completedNow: false };
  const prev = row.progress || 0;
  const newProg = Math.min(row.target, prev + Math.max(0, amount));
  db.prepare('UPDATE quest_progress SET progress = ? WHERE guild_id = ? AND user_id = ? AND quest_key = ?').run(newProg, guildId, userId, key);
  const completedNow = prev < row.target && newProg >= row.target && (row.claimed === 0);
  return { completedNow };
}

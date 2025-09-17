// src/utils/achievements.js
import { getDB } from '../lib/db.js';
import { incWallet } from '../lib/econ.js';

// Definitions
export const ACHIEVEMENTS = {
  first_work: { name: 'First Shift', desc: 'Complete your first /work', reward_coins: 100 },
  coin_1000: { name: 'Piggy Bank', desc: 'Reach 1,000 total coins', reward_coins: 150 },
  level_5:   { name: 'Getting There', desc: 'Reach level 5', reward_coins: 200 },
  streak_7:  { name: 'One Week Wonder', desc: 'Reach a 7-day daily streak', reward_coins: 250 },
  first_buy: { name: 'Shopper', desc: 'Purchase your first shop item', reward_coins: 100 },
};

export function hasAchievement(guildId, userId, key){
  const db = getDB();
  const row = db.prepare('SELECT 1 FROM user_achievements WHERE guild_id = ? AND user_id = ? AND key = ?').get(guildId, userId, key);
  return !!row;
}

export function grantAchievement(guildId, userId, key){
  const db = getDB();
  if (!ACHIEVEMENTS[key]) return false;
  if (hasAchievement(guildId, userId, key)) return false;
  const now = Date.now();
  db.prepare('INSERT INTO user_achievements (guild_id, user_id, key, earned_at) VALUES (?, ?, ?, ?)')
    .run(guildId, userId, key, now);
  const reward = ACHIEVEMENTS[key].reward_coins || 0;
  if (reward) incWallet(userId, reward, `achv:${key}`);
  return true;
}

export function listAchievements(guildId, userId){
  const db = getDB();
  const rows = db.prepare('SELECT key, earned_at FROM user_achievements WHERE guild_id = ? AND user_id = ? ORDER BY earned_at ASC').all(guildId, userId);
  return rows;
}


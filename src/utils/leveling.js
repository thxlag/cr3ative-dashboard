// src/utils/leveling.js
import { getDB } from '../lib/db.js';

// XP needed to go from level n -> n+1
export function xpToNextLevel(n) {
  return 5 * n * n + 50 * n + 100;
}

// From total XP, compute current level + progress
export function levelFromTotalXp(total) {
  let level = 0, spent = 0, next = xpToNextLevel(0);
  while (total >= spent + next) {
    spent += next;
    level++;
    next = xpToNextLevel(level);
  }
  const current = total - spent;
  const progress = next ? current / next : 0;
  return { level, current, next, progress }; // progress in [0..1]
}

// Random message XP 15..25
export function xpPerMessage() {
  return 15 + Math.floor(Math.random() * 11);
}

// Grant message XP with cooldown; returns level-up info
export function grantMessageXp(guildId, userId, amount, cooldownMs = 60_000) {
  const db = getDB();
  let row = db.prepare(
    'SELECT xp, last_xp_at FROM levels WHERE guild_id = ? AND user_id = ?'
  ).get(guildId, userId);

  const now = Date.now();
  if (!row) {
    db.prepare('INSERT INTO levels (guild_id, user_id, xp, last_xp_at) VALUES (?, ?, ?, ?)')
      .run(guildId, userId, 0, 0);
    row = { xp: 0, last_xp_at: 0 };
  }

  if (now - row.last_xp_at < cooldownMs) return { granted: false };

  const prevTotal = row.xp;
  const prevLevel = levelFromTotalXp(prevTotal).level;
  const newTotal = prevTotal + amount;

  db.prepare('UPDATE levels SET xp = ?, last_xp_at = ? WHERE guild_id = ? AND user_id = ?')
    .run(newTotal, now, guildId, userId);

  const newLevel = levelFromTotalXp(newTotal).level;
  return { granted: true, gained: amount, totalXp: newTotal, prevLevel, newLevel };
}

// Add arbitrary XP (used by quests/achievements rewards)
export function addXp(guildId, userId, amount){
  const db = getDB();
  let row = db.prepare('SELECT xp FROM levels WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!row) {
    db.prepare('INSERT INTO levels (guild_id, user_id, xp, last_xp_at) VALUES (?, ?, ?, ?)')
      .run(guildId, userId, 0, 0);
    row = { xp: 0 };
  }
  const newTotal = (row.xp || 0) + Math.max(0, amount);
  db.prepare('UPDATE levels SET xp = ? WHERE guild_id = ? AND user_id = ?').run(newTotal, guildId, userId);
  return newTotal;
}

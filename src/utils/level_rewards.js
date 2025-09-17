// src/utils/level_rewards.js
import { getDB } from '../lib/db.js';

/**
 * Grants any configured role rewards for <= currentLevel that the member doesn't have.
 * Requires the bot to have Manage Roles and role position above target roles.
 */
export async function applyLevelRewards(guild, member, currentLevel) {
  try {
    if (!guild || !member) return;
    const db = getDB();
    const rows = db.prepare(`
      SELECT role_id FROM level_role_rewards
      WHERE guild_id = ? AND level <= ?
      ORDER BY level ASC
    `).all(guild.id, currentLevel);

    if (!rows?.length) return;

    for (const r of rows) {
      const role = guild.roles.cache.get(r.role_id);
      if (!role) continue;
      if (member.roles.cache.has(role.id)) continue;
      // attempt to add; ignore failures (permissions/position)
      try { await member.roles.add(role, `Level reward (reached level ${currentLevel})`); }
      catch { /* noop */ }
    }
  } catch (e) {
    console.error('applyLevelRewards error:', e);
  }
}
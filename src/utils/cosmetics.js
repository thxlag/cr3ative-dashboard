import { getDB } from '../lib/db.js';

function ensureCosmetics(db){
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_cosmetics (
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        key TEXT NOT NULL,
        owned_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, type, key)
      );
      CREATE TABLE IF NOT EXISTS user_profile (
        user_id TEXT PRIMARY KEY,
        title_key TEXT,
        badges_json TEXT
      );
    `);
  } catch {}
}

export function listOwned(userId, type){
  const db = getDB(); ensureCosmetics(db);
  return db.prepare('SELECT key, owned_at FROM user_cosmetics WHERE user_id = ? AND type = ? ORDER BY owned_at ASC').all(userId, type);
}

export function ownCosmetic(userId, type, key){
  const db = getDB(); ensureCosmetics(db);
  db.prepare('INSERT INTO user_cosmetics (user_id, type, key, owned_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, type, key) DO NOTHING')
    .run(userId, type, key, Date.now());
}

export function setTitle(userId, key){
  const db = getDB(); ensureCosmetics(db);
  ownCosmetic(userId, 'title', key);
  db.prepare('INSERT INTO user_profile (user_id, title_key) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET title_key = excluded.title_key')
    .run(userId, key);
}

export function getProfileCosmetics(userId){
  const db = getDB(); ensureCosmetics(db);
  const row = db.prepare('SELECT title_key, badges_json FROM user_profile WHERE user_id = ?').get(userId) || {};
  let badges = [];
  try { badges = JSON.parse(row.badges_json || '[]'); } catch { badges = []; }
  return { title: row.title_key || null, badges };
}

export function equipBadges(userId, keys){
  const db = getDB(); ensureCosmetics(db);
  const arr = Array.isArray(keys) ? keys.slice(0, 3) : [];
  db.prepare('INSERT INTO user_profile (user_id, title_key, badges_json) VALUES (?, NULL, ?) ON CONFLICT(user_id) DO UPDATE SET badges_json = excluded.badges_json')
    .run(userId, JSON.stringify(arr));
}


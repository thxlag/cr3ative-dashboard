import { getDB } from '../lib/db.js';

function ensurePets(db){
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pets (
        user_id TEXT PRIMARY KEY,
        pet_type TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        exp INTEGER NOT NULL DEFAULT 0,
        mood INTEGER NOT NULL DEFAULT 60,
        energy INTEGER NOT NULL DEFAULT 60,
        last_care_at INTEGER NOT NULL DEFAULT 0,
        last_feed_at INTEGER NOT NULL DEFAULT 0,
        last_play_at INTEGER NOT NULL DEFAULT 0,
        last_train_at INTEGER NOT NULL DEFAULT 0
      );
    `);
  } catch {}
}

function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

export function getPet(userId){
  const db = getDB(); ensurePets(db);
  const row = db.prepare('SELECT * FROM pets WHERE user_id = ?').get(userId);
  if (!row) return null;
  // passive decay: 5 points per hour since last_care_at
  const now = Date.now();
  const last = row.last_care_at || 0;
  const hours = Math.floor((now - last) / (60*60*1000));
  if (hours > 0){
    const mood = clamp((row.mood||0) - hours*5, 0, 100);
    const energy = clamp((row.energy||0) - hours*5, 0, 100);
    db.prepare('UPDATE pets SET mood = ?, energy = ?, last_care_at = ? WHERE user_id = ?')
      .run(mood, energy, now, userId);
    row.mood = mood; row.energy = energy; row.last_care_at = now;
  }
  return row;
}

export function adoptPet(userId, type='dog'){
  const db = getDB(); ensurePets(db);
  const existing = getPet(userId);
  if (existing) return { ok: false, code: 'exists' };
  const now = Date.now();
  db.prepare('INSERT INTO pets (user_id, pet_type, level, exp, mood, energy, last_care_at) VALUES (?, ?, 1, 0, 70, 70, ?)')
    .run(userId, type, now);
  return { ok: true, pet: getPet(userId) };
}

export function feedPet(userId){
  const db = getDB(); ensurePets(db);
  const p = getPet(userId); if (!p) return { ok: false, code: 'no_pet' };
  const cd = Math.max(30, Number(process.env.PET_FEED_COOLDOWN_SEC || 180)) * 1000;
  const now = Date.now();
  const remaining = Math.max(0, (p.last_feed_at + cd) - now);
  if (remaining > 0) return { ok: false, code: 'cooldown', remaining };
  const energy = clamp((p.energy||0) + 30, 0, 100);
  db.prepare('UPDATE pets SET energy = ?, last_feed_at = ?, last_care_at = ? WHERE user_id = ?')
    .run(energy, now, now, userId);
  return { ok: true, energy };
}

export function playPet(userId){
  const db = getDB(); ensurePets(db);
  const p = getPet(userId); if (!p) return { ok: false, code: 'no_pet' };
  const cd = Math.max(30, Number(process.env.PET_PLAY_COOLDOWN_SEC || 180)) * 1000;
  const now = Date.now();
  const remaining = Math.max(0, (p.last_play_at + cd) - now);
  if (remaining > 0) return { ok: false, code: 'cooldown', remaining };
  const mood = clamp((p.mood||0) + 30, 0, 100);
  db.prepare('UPDATE pets SET mood = ?, last_play_at = ?, last_care_at = ? WHERE user_id = ?')
    .run(mood, now, now, userId);
  return { ok: true, mood };
}

export function trainPet(userId){
  const db = getDB(); ensurePets(db);
  const p = getPet(userId); if (!p) return { ok: false, code: 'no_pet' };
  const cd = Math.max(60, Number(process.env.PET_TRAIN_COOLDOWN_SEC || 600)) * 1000;
  const now = Date.now();
  const remaining = Math.max(0, (p.last_train_at + cd) - now);
  if (remaining > 0) return { ok: false, code: 'cooldown', remaining };
  if ((p.energy||0) < 15) return { ok: false, code: 'tired' };
  let exp = (p.exp||0) + Math.max(5, Number(process.env.PET_TRAIN_XP || 10));
  let level = p.level || 1;
  const need = level * 100;
  let leveled = false;
  if (exp >= need){ level += 1; exp -= need; leveled = true; }
  const energy = clamp((p.energy||0) - 15, 0, 100);
  db.prepare('UPDATE pets SET exp = ?, level = ?, energy = ?, last_train_at = ?, last_care_at = ? WHERE user_id = ?')
    .run(exp, level, energy, now, now, userId);
  return { ok: true, exp, level, energy, leveled };
}

export function getPetBoost(userId){
  const p = getPet(userId);
  if (!p) return { mult: 1.0, level: 0 };
  const levelBoost = (p.level||1) * 0.005; // +0.5% per level
  const moodBoost = (p.mood||0) / 100 * 0.01; // up to +1%
  const energyBoost = (p.energy||0) / 100 * 0.005; // up to +0.5%
  let boost = levelBoost + moodBoost + energyBoost;
  const cap = Math.max(0.02, Number(process.env.PET_BOOST_CAP || 0.05));
  boost = Math.min(cap, boost);
  return { mult: 1 + boost, level: p.level||1, mood: p.mood||0, energy: p.energy||0 };
}


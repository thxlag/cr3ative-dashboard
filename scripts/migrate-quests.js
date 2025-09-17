// scripts/migrate-quests.js
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';

await ensureDB();
const db = getDB();

db.exec('BEGIN');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_progress (
      guild_id    TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      quest_key   TEXT NOT NULL,
      period      TEXT NOT NULL,  -- 'daily' | 'weekly'
      progress    INTEGER NOT NULL DEFAULT 0,
      target      INTEGER NOT NULL,
      reward_coins INTEGER NOT NULL DEFAULT 0,
      reward_xp   INTEGER NOT NULL DEFAULT 0,
      claimed     INTEGER NOT NULL DEFAULT 0,
      last_reset  TEXT NOT NULL,
      PRIMARY KEY (guild_id, user_id, quest_key)
    );
    CREATE INDEX IF NOT EXISTS idx_quest_user ON quest_progress (guild_id, user_id, period);
  `);
  db.exec('COMMIT');
  console.log('✅ quests table ready');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}


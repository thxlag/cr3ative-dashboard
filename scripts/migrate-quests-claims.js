// scripts/migrate-quests-claims.js
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';

await ensureDB();
const db = getDB();

db.exec('BEGIN');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_claims (
      guild_id  TEXT NOT NULL,
      user_id   TEXT NOT NULL,
      quest_key TEXT NOT NULL,
      points    INTEGER NOT NULL DEFAULT 1,
      at_ts     INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id, quest_key, at_ts)
    );
    CREATE INDEX IF NOT EXISTS idx_quest_claims_guild_ts ON quest_claims (guild_id, at_ts DESC);
  `);
  db.exec('COMMIT');
  console.log('✅ quest claims table ready');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}


// scripts/migrate-quests-rotation.js
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';

await ensureDB();
const db = getDB();

db.exec('BEGIN');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_rotation (
      guild_id TEXT NOT NULL,
      period   TEXT NOT NULL,  -- 'daily' | 'weekly'
      ref      TEXT NOT NULL,  -- e.g., YYYY-MM-DD or YYYY-W##
      keys     TEXT NOT NULL,  -- JSON array of quest keys
      PRIMARY KEY (guild_id, period, ref)
    );
  `);
  db.exec('COMMIT');
  console.log('✅ quest rotation table ready');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}


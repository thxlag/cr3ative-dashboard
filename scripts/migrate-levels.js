// scripts/migrate-levels.js
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';

await ensureDB();
const db = getDB();

db.exec('BEGIN');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS levels (
      guild_id   TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      xp         INTEGER NOT NULL DEFAULT 0,
      last_xp_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_levels_guild_xp ON levels (guild_id, xp);
  `);
  db.exec('COMMIT');
  console.log('✅ levels table ready');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}

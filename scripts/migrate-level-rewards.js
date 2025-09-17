// scripts/migrate-level-rewards.js
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';

await ensureDB();
const db = getDB();

db.exec('BEGIN');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS level_role_rewards (
      guild_id TEXT NOT NULL,
      level    INTEGER NOT NULL,
      role_id  TEXT NOT NULL,
      PRIMARY KEY (guild_id, level, role_id)
    );
    CREATE INDEX IF NOT EXISTS idx_lr_guild_level ON level_role_rewards (guild_id, level);
  `);
  db.exec('COMMIT');
  console.log('✅ level_role_rewards ready');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';

await ensureDB();
const db = getDB();

db.exec('BEGIN');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lottery_state (
      guild_id TEXT PRIMARY KEY,
      pool INTEGER NOT NULL DEFAULT 0,
      role_id TEXT,
      last_winner_user_id TEXT,
      last_win_amount INTEGER,
      last_draw_ts INTEGER
    );

    CREATE TABLE IF NOT EXISTS lottery_active (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT,
      started_by TEXT,
      started_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lottery_entries (
      guild_id TEXT NOT NULL,
      user_id  TEXT NOT NULL,
      tickets  INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_lottery_entries_guild ON lottery_entries (guild_id);
  `);

  db.exec('COMMIT');
  console.log('✅ lottery tables ready');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}


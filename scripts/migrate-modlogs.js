// scripts/migrate-modlogs.js
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';

await ensureDB();
const db = getDB();

db.exec('BEGIN');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS modlog_settings (
      guild_id   TEXT PRIMARY KEY,
      channel_id TEXT
    );

    CREATE TABLE IF NOT EXISTS mod_cases (
      guild_id       TEXT NOT NULL,
      case_id        INTEGER NOT NULL,
      action         TEXT NOT NULL,              -- 'ban' | 'kick' | 'timeout' | others later
      target_id      TEXT NOT NULL,
      moderator_id   TEXT NOT NULL,
      reason         TEXT,
      created_at     INTEGER NOT NULL,
      log_channel_id TEXT,
      log_message_id TEXT,
      extra_json     TEXT,                       -- optional metadata
      PRIMARY KEY (guild_id, case_id)
    );
    CREATE INDEX IF NOT EXISTS idx_mod_cases_guild_created ON mod_cases (guild_id, created_at DESC);
  `);
  db.exec('COMMIT');
  console.log('✅ modlog tables ready');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}


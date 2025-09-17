// scripts/migrate-burst.js
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';

await ensureDB();
const db = getDB();

db.exec('BEGIN');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events_meta (
      guild_id    TEXT PRIMARY KEY,
      type        TEXT NOT NULL,
      config_json TEXT
    );

    CREATE TABLE IF NOT EXISTS event_progress (
      guild_id TEXT NOT NULL,
      user_id  TEXT NOT NULL,
      metric   TEXT NOT NULL,
      value    INTEGER NOT NULL DEFAULT 0,
      completed_ts INTEGER,
      PRIMARY KEY (guild_id, user_id, metric)
    );
    CREATE INDEX IF NOT EXISTS idx_event_progress_guild_metric ON event_progress (guild_id, metric);
  `);
  db.exec('COMMIT');
  console.log('✅ burst event tables ready');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}


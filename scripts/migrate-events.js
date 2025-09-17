// scripts/migrate-events.js
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';

await ensureDB();
const db = getDB();

db.exec('BEGIN');
try {
  // active event per guild
  db.exec(`
    CREATE TABLE IF NOT EXISTS events_active (
      guild_id   TEXT PRIMARY KEY,
      event_name TEXT NOT NULL,
      multiplier REAL NOT NULL DEFAULT 1.0,
      started_by TEXT,
      channel_id TEXT,              -- announce channel
      start_ts   INTEGER NOT NULL,
      end_ts     INTEGER NOT NULL
    );
  `);

  // results table (you may already have this; safe to re-create)
  db.exec(`
    CREATE TABLE IF NOT EXISTS event_results (
      guild_id   TEXT NOT NULL,
      event_name TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      score      INTEGER NOT NULL DEFAULT 1,
      at_ts      INTEGER NOT NULL,
      PRIMARY KEY (guild_id, event_name, user_id, at_ts)
    );
    CREATE INDEX IF NOT EXISTS idx_event_results_guild_event_score
      ON event_results (guild_id, event_name, score DESC, at_ts DESC);
  `);

  db.exec('COMMIT');
  console.log('✅ events tables ready');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}
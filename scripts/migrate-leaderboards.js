// scripts/migrate-leaderboards.js
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';

await ensureDB();
const db = getDB();

db.exec('BEGIN');
try {
  // each lottery payout gets a row
  db.exec(`
    CREATE TABLE IF NOT EXISTS lottery_wins (
      guild_id TEXT NOT NULL,
      user_id  TEXT NOT NULL,
      amount   INTEGER NOT NULL,
      at_ts    INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id, at_ts)
    );
    CREATE INDEX IF NOT EXISTS idx_lottery_wins_guild_amount ON lottery_wins (guild_id, amount DESC, at_ts DESC);
  `);

  // event results (generic): name + score, so you can reuse for tournaments, contests, etc.
  db.exec(`
    CREATE TABLE IF NOT EXISTS event_results (
      guild_id   TEXT NOT NULL,
      event_name TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      score      INTEGER NOT NULL DEFAULT 1,
      at_ts      INTEGER NOT NULL,
      PRIMARY KEY (guild_id, event_name, user_id, at_ts)
    );
    CREATE INDEX IF NOT EXISTS idx_event_results_guild_event_score ON event_results (guild_id, event_name, score DESC, at_ts DESC);
  `);

  db.exec('COMMIT');
  console.log('✅ leaderboards tables ready');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}

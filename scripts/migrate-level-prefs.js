// scripts/migrate-level-prefs.js
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';

await ensureDB();
const db = getDB();

db.exec('BEGIN');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS level_guild_settings (
      guild_id TEXT PRIMARY KEY,
      levelups_channel_id TEXT,  -- where "on" pings go (default #level-ups)
      clips_channel_id    TEXT,  -- where to pull clips for DM mode
      throttle_sec        INTEGER NOT NULL DEFAULT 30
    );

    CREATE TABLE IF NOT EXISTS level_user_prefs (
      guild_id TEXT NOT NULL,
      user_id  TEXT NOT NULL,
      mode     TEXT NOT NULL DEFAULT 'on', -- 'off' | 'on' | 'announce' | 'dm'
      PRIMARY KEY (guild_id, user_id)
    );
  `);
  db.exec('COMMIT');
  console.log('✅ level settings & prefs ready');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}

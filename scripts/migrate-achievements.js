// scripts/migrate-achievements.js
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';

await ensureDB();
const db = getDB();

db.exec('BEGIN');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_achievements (
      guild_id  TEXT NOT NULL,
      user_id   TEXT NOT NULL,
      key       TEXT NOT NULL,
      earned_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id, key)
    );
  `);
  db.exec('COMMIT');
  console.log('✅ achievements table ready');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}


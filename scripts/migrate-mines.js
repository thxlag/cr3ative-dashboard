// scripts/migrate-mines.js
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';

await ensureDB();
const db = getDB();

db.exec('BEGIN');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mines_rounds (
      round_id   TEXT PRIMARY KEY,
      guild_id   TEXT,
      user_id    TEXT NOT NULL,
      bet        INTEGER NOT NULL,
      mines      INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      ended      INTEGER NOT NULL DEFAULT 0,
      commit_hash TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_mines_rounds_created ON mines_rounds (created_at);
    CREATE INDEX IF NOT EXISTS idx_mines_rounds_user ON mines_rounds (user_id);
  `);
  db.exec('COMMIT');
  console.log('✅ mines_rounds table ready');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}

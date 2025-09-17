// scripts/migrate-jobs-switch.js
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';

await ensureDB();
const db = getDB();

db.exec('BEGIN');
try {
  const cols = db.prepare('PRAGMA table_info(user_jobs)').all();
  const hasChanged = cols.some(c => c.name === 'last_changed_at');
  if (!hasChanged) {
    db.prepare('ALTER TABLE user_jobs ADD COLUMN last_changed_at INTEGER NOT NULL DEFAULT 0').run();
  }
  db.exec('COMMIT');
  console.log('✅ jobs switch cooldown migration complete');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}


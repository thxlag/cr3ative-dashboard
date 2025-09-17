// scripts/migrate-jobs-promotions.js
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';

await ensureDB();
const db = getDB();

db.exec('BEGIN');
try {
  // Add tier column to user_jobs if missing
  const cols = db.prepare('PRAGMA table_info(user_jobs)').all();
  const hasTier = cols.some(c => c.name === 'tier');
  if (!hasTier) {
    db.prepare('ALTER TABLE user_jobs ADD COLUMN tier INTEGER NOT NULL DEFAULT 1').run();
  }

  db.exec('COMMIT');
  console.log('✅ jobs promotions migration complete');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}


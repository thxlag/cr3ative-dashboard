// scripts/migrate-streaks.js
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';

await ensureDB();
const db = getDB();

const cols = db.prepare(`PRAGMA table_info(users)`).all();
const hasStreak = cols.some(c => c.name === 'streak');
const hasLastClaimDay = cols.some(c => c.name === 'last_claim_day');

db.exec('BEGIN');
try {
  if (!hasStreak) {
    db.prepare(`ALTER TABLE users ADD COLUMN streak INTEGER NOT NULL DEFAULT 0`).run();
    console.log('✔ added users.streak');
  } else {
    console.log('• users.streak already exists');
  }

  if (!hasLastClaimDay) {
    db.prepare(`ALTER TABLE users ADD COLUMN last_claim_day TEXT`).run();
    console.log('✔ added users.last_claim_day');
  } else {
    console.log('• users.last_claim_day already exists');
  }

  db.exec('COMMIT');
  console.log('✅ migration complete');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}

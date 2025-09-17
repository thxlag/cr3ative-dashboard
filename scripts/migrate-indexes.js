// scripts/migrate-indexes.js
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';

await ensureDB();
const db = getDB();

db.exec('BEGIN');
try {
  db.exec(`
    -- Economy txns fast lookup per user newest-first
    CREATE INDEX IF NOT EXISTS idx_txns_user_created ON txns (user_id, id DESC);

    -- Mod cases recent ordering
    CREATE INDEX IF NOT EXISTS idx_mod_cases_guild_created ON mod_cases (guild_id, created_at DESC);

    -- Event results recent ordering (already exists in some migrations)
    CREATE INDEX IF NOT EXISTS idx_event_results_recent ON event_results (guild_id, event_name, at_ts DESC);
  `);
  db.exec('COMMIT');
  console.log('✅ indexes ready');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}


// scripts/migrate-all.js
// Runs all migration scripts in a safe order using child processes.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scripts = [
  'migrate-levels.js',
  'migrate-level-prefs.js',
  'migrate-level-rewards.js',
  'migrate-events.js',
  'migrate-leaderboards.js',
  'migrate-modlogs.js',
  'migrate-shop.js',
  'migrate-jobs.js',
  'migrate-jobs-promotions.js',
  'migrate-jobs-switch.js',
  'migrate-quests.js',
  'migrate-achievements.js',
  'migrate-quests-rotation.js',
  'migrate-quests-claims.js',
  'migrate-lottery.js',
  // add new migrations here in order
];

for (const s of scripts) {
  const p = path.join(__dirname, s);
  const res = spawnSync(process.execPath, [p], { stdio: 'inherit', env: process.env });
  if (res.status !== 0) {
    console.error(`❌ Migration failed at ${s}`);
    process.exit(res.status || 1);
  }
}

console.log('✅ All migrations completed');

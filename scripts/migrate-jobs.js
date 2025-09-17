// scripts/migrate-jobs.js
import 'dotenv/config';
import { ensureDB, getDB } from '../src/lib/db.js';

await ensureDB();
const db = getDB();

db.exec('BEGIN');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL UNIQUE,
      description   TEXT,
      min_pay       INTEGER NOT NULL,
      max_pay       INTEGER NOT NULL,
      cooldown_sec  INTEGER NOT NULL,
      level_req     INTEGER NOT NULL DEFAULT 0,
      enabled       INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS user_jobs (
      user_id        TEXT PRIMARY KEY,
      job_id         INTEGER NOT NULL,
      works_completed INTEGER NOT NULL DEFAULT 0,
      total_earned   INTEGER NOT NULL DEFAULT 0,
      last_work_at   INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE RESTRICT
    );
  `);

  const count = db.prepare('SELECT COUNT(*) AS c FROM jobs').get().c;
  if (count === 0) {
    const ins = db.prepare('INSERT INTO jobs (name, description, min_pay, max_pay, cooldown_sec, level_req, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)');
    ins.run('Barista', 'Serve coffee and keep the line moving.', 60, 120, 30, 0);
    ins.run('Courier', 'Deliver packages across town in record time.', 100, 180, 45, 3);
    ins.run('Developer', 'Fix bugs, ship features, maybe write tests.', 180, 300, 60, 6);
    ins.run('Streamer', 'Go live, entertain, and grow your community.', 220, 380, 75, 8);
    ins.run('Entrepreneur', 'Build a startup, pivot twice, achieve PMF.', 300, 500, 90, 10);
  }

  db.exec('COMMIT');
  console.log('✅ jobs tables ready');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}


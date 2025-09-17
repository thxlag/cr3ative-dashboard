import { getDB } from '../lib/db.js';
import { incWallet } from '../lib/econ.js';

function ensureTables(db){
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS job_contracts_daily (
        user_id TEXT NOT NULL,
        day TEXT NOT NULL,
        required INTEGER NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        reward INTEGER NOT NULL,
        claimed INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day)
      );
    `);
  } catch {}
}

function todayUTC(){ return new Date().toISOString().slice(0,10); }

export function getOrCreateDailyContract(userId){
  const db = getDB();
  ensureTables(db);
  const day = todayUTC();
  let row = db.prepare('SELECT required, progress, reward, claimed FROM job_contracts_daily WHERE user_id = ? AND day = ?')
    .get(userId, day);
  if (!row){
    const req = Math.max(1, Number(process.env.JOB_DAILY_CONTRACT_REQUIRED || 3));
    const rew = Math.max(10, Number(process.env.JOB_DAILY_CONTRACT_REWARD || 200));
    db.prepare('INSERT INTO job_contracts_daily (user_id, day, required, progress, reward, claimed) VALUES (?, ?, ?, 0, ?, 0)')
      .run(userId, day, req, rew);
    row = { required: req, progress: 0, reward: rew, claimed: 0 };
  }
  return { day, ...row };
}

export function incDailyContractProgress(userId, amount = 1){
  const db = getDB();
  const { day } = getOrCreateDailyContract(userId);
  db.prepare('UPDATE job_contracts_daily SET progress = progress + ? WHERE user_id = ? AND day = ?')
    .run(Math.max(1, Math.floor(amount)), userId, day);
}

export function claimDailyContract(userId){
  const db = getDB();
  const { day } = getOrCreateDailyContract(userId);
  const row = db.prepare('SELECT required, progress, reward, claimed FROM job_contracts_daily WHERE user_id = ? AND day = ?')
    .get(userId, day);
  if (!row) return { ok: false, code: 'not_found' };
  if (row.claimed) return { ok: false, code: 'claimed' };
  if ((row.progress||0) < (row.required||0)) return { ok: false, code: 'incomplete', need: row.required, have: row.progress };
  db.prepare('UPDATE job_contracts_daily SET claimed = 1 WHERE user_id = ? AND day = ?')
    .run(userId, day);
  try { incWallet(userId, row.reward, 'job_contract_daily'); } catch {}
  return { ok: true, reward: row.reward };
}


// src/utils/jobs.js
import { getDB } from '../lib/db.js';
import { getActiveEvent } from './events.js';
import { getPetBoost } from './pets.js';
import { incWallet } from '../lib/econ.js';
import { levelFromTotalXp } from './leveling.js';
import { incDailyContractProgress } from './work_contracts.js';

const PROMO_THRESHOLDS = [10, 30, 60, 100, 150]; // works_completed needed per tier up (tier 1->2, 2->3, ...)
const MAX_TIER = PROMO_THRESHOLDS.length + 1;     // e.g., 6 tiers

// --- self-heal tables/columns ---
function ensureWorkStreakColumns(db){
  try {
    const cols = db.prepare('PRAGMA table_info(users)').all();
    const names = new Set(cols.map(c=>String(c.name)));
    if (!names.has('work_streak')) db.prepare('ALTER TABLE users ADD COLUMN work_streak INTEGER NOT NULL DEFAULT 0').run();
    if (!names.has('last_work_day')) db.prepare('ALTER TABLE users ADD COLUMN last_work_day TEXT').run();
  } catch {}
}

function ensureJobSkillsTable(db){
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_job_skills (
        user_id TEXT NOT NULL,
        job_id INTEGER NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (user_id, job_id)
      );
    `);
  } catch {}
}

export function listJobs() {
  const db = getDB();
  return db.prepare('SELECT id, name, description, min_pay, max_pay, cooldown_sec, level_req, enabled FROM jobs WHERE enabled = 1 ORDER BY level_req ASC, min_pay ASC').all();
}

export function getJob(id) {
  const db = getDB();
  return db.prepare('SELECT id, name, description, min_pay, max_pay, cooldown_sec, level_req, enabled FROM jobs WHERE id = ?').get(id) || null;
}

export function getUserJob(userId) {
  const db = getDB();
  const row = db.prepare(`
    SELECT uj.user_id, uj.job_id, uj.works_completed, uj.total_earned, uj.last_work_at, COALESCE(uj.tier, 1) AS tier, COALESCE(uj.last_changed_at,0) AS last_changed_at,
           j.name, j.description, j.min_pay, j.max_pay, j.cooldown_sec, j.level_req
    FROM user_jobs uj
    JOIN jobs j ON j.id = uj.job_id
    WHERE uj.user_id = ?
  `).get(userId);
  return row || null;
}

export function setUserJob(userId, jobId) {
  const db = getDB();
  const now = Date.now();
  db.prepare(`
    INSERT INTO user_jobs (user_id, job_id, works_completed, total_earned, last_work_at, tier, last_changed_at)
    VALUES (?, ?, 0, 0, 0, 1, ?)
    ON CONFLICT(user_id) DO UPDATE SET job_id=excluded.job_id, last_work_at=0, tier=1, works_completed=0, total_earned=0, last_changed_at=excluded.last_changed_at
  `).run(userId, jobId, now);
}

export function jobChangeRemainingMs(userId, cooldownMs) {
  const row = getUserJob(userId);
  if (!row) return 0;
  const last = row.last_changed_at || 0;
  const remaining = (last + cooldownMs) - Date.now();
  return remaining > 0 ? remaining : 0;
}

export function userLevelInGuild(db, guildId, userId) {
  const row = db.prepare('SELECT xp FROM levels WHERE guild_id = ? AND user_id = ?').get(guildId, userId) || { xp: 0 };
  return levelFromTotalXp(row.xp || 0).level;
}

export function canApplyToJob(guildId, userId, job) {
  const db = getDB();
  const level = userLevelInGuild(db, guildId, userId);
  if (level < (job.level_req || 0)) return { ok: false, code: 'level_req', need: job.level_req };
  return { ok: true };
}

export function timeUntilWork(userId) {
  const db = getDB();
  const row = getUserJob(userId);
  if (!row) return null;
  const remaining = (row.last_work_at + row.cooldown_sec * 1000) - Date.now();
  return remaining > 0 ? remaining : 0;
}

function hasItemByName(userId, name) {
  const db = getDB();
  const row = db.prepare(`
    SELECT ui.qty FROM user_inventory ui
    JOIN shop_items si ON si.id = ui.item_id
    WHERE ui.user_id = ? AND si.name = ? AND ui.qty > 0
  `).get(userId, name);
  return !!row;
}

function ensureUserJobSpecColumn(db){
  try {
    const cols = db.prepare('PRAGMA table_info(user_jobs)').all();
    const names = new Set(cols.map(c=>String(c.name)));
    if (!names.has('spec')) db.prepare('ALTER TABLE user_jobs ADD COLUMN spec TEXT').run();
  } catch {}
}

export function setUserJobSpec(userId, spec){
  const db = getDB();
  ensureUserJobSpecColumn(db);
  db.prepare('UPDATE user_jobs SET spec = ? WHERE user_id = ?').run(spec || null, userId);
}

export function getUserJobSpec(userId){
  const db = getDB();
  ensureUserJobSpecColumn(db);
  const row = db.prepare('SELECT spec FROM user_jobs WHERE user_id = ?').get(userId) || { spec: null };
  return row.spec || null;
}

function tierMultiplier(tier) {
  return 1 + 0.1 * Math.max(0, (tier || 1) - 1); // +10% per tier above 1
}

function rollShiftEvent() {
  // Weighted random events; primarily positive
  // returns { type, desc, payMult, flatBonus, cooldownMult }
  const r = Math.random();
  if (r < 0.08) return { type: 'perfect', desc: 'Perfect Shift (+50%)', payMult: 1.5 };
  if (r < 0.18) return { type: 'vip', desc: 'VIP Client (+35%)', payMult: 1.35 };
  if (r < 0.30) return { type: 'tips', desc: 'Great Tips (+25%)', payMult: 1.25 };
  if (r < 0.40) return { type: 'rush', desc: 'Rush Hour (cooldown -50%)', cooldownMult: 0.5 };
  if (r < 0.48) return { type: 'bonus', desc: 'Spot Bonus (+100 coins)', flatBonus: 100 };
  if (r < 0.52) return { type: 'overtime', desc: 'Overtime (+20%, cooldown +25%)', payMult: 1.2, cooldownMult: 1.25 };
  return { type: 'none', desc: null };
}

function computeWorkStreak(db, userId){
  ensureWorkStreakColumns(db);
  const row = db.prepare('SELECT work_streak, last_work_day FROM users WHERE user_id = ?').get(userId) || { work_streak: 0, last_work_day: null };
  const today = new Date().toISOString().slice(0,10);
  const yesterday = (()=>{ const d = new Date(); d.setUTCDate(d.getUTCDate()-1); return d.toISOString().slice(0,10); })();
  let streak = 1;
  if (row.last_work_day === today) streak = row.work_streak || 1; // same day repeat
  else if (row.last_work_day === yesterday) streak = (row.work_streak||0) + 1; else streak = 1;
  db.prepare('UPDATE users SET work_streak = ?, last_work_day = ? WHERE user_id = ?').run(streak, today, userId);
  const step = Math.max(0, Math.min(100, Number(process.env.WORK_STREAK_STEP_PCT || 0.02))); // 2%/day
  const cap = Math.max(0, Math.min(1, Number(process.env.WORK_STREAK_MAX_BONUS || 0.15)));   // 15% cap
  const bonusMult = 1 + Math.min(cap, streak * step);
  return { streak, bonusMult };
}

function getJobSkill(db, userId, jobId){
  ensureJobSkillsTable(db);
  const row = db.prepare('SELECT xp, level FROM user_job_skills WHERE user_id = ? AND job_id = ?').get(userId, jobId);
  if (row) return row;
  db.prepare('INSERT INTO user_job_skills (user_id, job_id, xp, level) VALUES (?, ?, 0, 1)').run(userId, jobId);
  return { xp: 0, level: 1 };
}

function addJobXp(db, userId, jobId, amount){
  ensureJobSkillsTable(db);
  const cur = getJobSkill(db, userId, jobId);
  const add = Math.max(1, Math.floor(amount));
  const xp = cur.xp + add;
  const perLevel = Math.max(20, Number(process.env.JOB_XP_PER_LEVEL || 100));
  const level = Math.max(1, Math.floor(xp / perLevel) + 1);
  const leveledUp = level > cur.level;
  db.prepare('UPDATE user_job_skills SET xp = ?, level = ? WHERE user_id = ? AND job_id = ?').run(xp, level, userId, jobId);
  return { xp, level, leveledUp };
}

export function work(userId, opts = {}) {
  const db = getDB();
  const row = getUserJob(userId);
  if (!row) return { ok: false, code: 'no_job' };
  const now = Date.now();
  const nextAt = row.last_work_at + row.cooldown_sec * 1000;
  if (now < nextAt) return { ok: false, code: 'cooldown', remaining: nextAt - now };

  const base = row.min_pay + Math.floor(Math.random() * (row.max_pay - row.min_pay + 1));
  let amount = base;

  // Promotions multiplier by tier
  const tMult = tierMultiplier(row.tier);
  amount = Math.round(amount * tMult);

  // Item boosts (e.g., Lucky Charm)
  let gearMult = 1.0;
  if (hasItemByName(userId, 'Lucky Charm')) gearMult *= 1.10;
  if (hasItemByName(userId, 'Pro Toolkit')) gearMult *= 1.10;
  if (hasItemByName(userId, 'VIP Badge')) gearMult *= 1.05; // small passive boost
  amount = Math.round(amount * gearMult);

  // Shift event
  const event = rollShiftEvent();
  if (event.payMult) amount = Math.round(amount * event.payMult);
  if (event.flatBonus) amount += event.flatBonus;

  // Skills multiplier
  const skill = getJobSkill(db, userId, row.job_id);
  const skillMult = 1 + 0.02 * Math.max(0, (skill.level || 1) - 1); // +2% per level
  amount = Math.round(amount * skillMult);

  // Work streak bonus (daily)
  const streakInfo = computeWorkStreak(db, userId);
  amount = Math.round(amount * streakInfo.bonusMult);

  // Specialization bonus
  const spec = getUserJobSpec(userId);
  let specMult = 1.0;
  let cdMultFromSpec = 1.0;
  if (spec === 'quality') specMult *= 1.10; // +10% pay
  if (spec === 'speed') cdMultFromSpec *= 0.90; // -10% cooldown
  if (spec === 'vip') specMult *= 1.05; // +5% pay
  amount = Math.round(amount * specMult);

  // Server event multiplier (if any)
  let serverMult = 1.0;
  try {
    const active = getActiveEvent?.(null) ? null : null; // no guild scoped alternative here
  } catch {}
  // If you want global multiplier via env
  const envMult = Number(process.env.JOB_GLOBAL_MULT || 1);
  if (envMult && envMult !== 1) serverMult = envMult;
  amount = Math.round(amount * serverMult);

  // Role-based perks (passed in opts)
  const roleMult = Math.max(0.5, Number(opts.roleMult || 1));
  amount = Math.round(amount * roleMult);

  // Pet boost
  const pet = getPetBoost(userId);
  amount = Math.round(amount * (pet.mult || 1));

  db.exec('BEGIN');
  try {
    // payout
    incWallet(userId, amount, `job:${row.job_id}`);

    // cooldown adjust if rush event
    let cdMs = row.cooldown_sec * 1000;
    const effectiveNow = event.cooldownMult ? now - Math.floor(cdMs * (1 - event.cooldownMult)) : now;
    cdMs = Math.round(cdMs * cdMultFromSpec);

    // update stats
    db.prepare('UPDATE user_jobs SET works_completed = works_completed + 1, total_earned = total_earned + ?, last_work_at = ? WHERE user_id = ?')
      .run(amount, effectiveNow, userId);

    // check promotions
    const updated = db.prepare('SELECT works_completed, COALESCE(tier,1) as tier FROM user_jobs WHERE user_id = ?').get(userId);
    let newTier = updated.tier;
    while (newTier < MAX_TIER) {
      const needed = PROMO_THRESHOLDS[newTier - 1];
      if (updated.works_completed >= needed) newTier++;
      else break;
    }
    let promoted = false;
    if (newTier !== updated.tier) {
      db.prepare('UPDATE user_jobs SET tier = ? WHERE user_id = ?').run(newTier, userId);
      promoted = true;
    }

    // skills xp gain
    const xpGain = Math.max(1, Number(process.env.JOB_XP_PER_WORK || 10));
    const skillAfter = addJobXp(db, userId, row.job_id, xpGain);
    try { incDailyContractProgress(userId, 1); } catch {}

    db.exec('COMMIT');
    const next_in = Math.max(0, (effectiveNow + cdMs) - now);
    return {
      ok: true,
      amount,
      job: row,
      next_in,
      event,
      promoted,
      newTier: promoted ? newTier : row.tier,
      breakdown: {
        base,
        tMult,
        gearMult,
        event: event?.desc || null,
        eventMult: event?.payMult || 1,
        flat: event?.flatBonus || 0,
        skillLevel: skillAfter.level,
        skillMult,
        streak: streakInfo.streak,
        streakMult: streakInfo.bonusMult,
        serverMult,
        spec: spec || null,
        specMult,
        roleMult,
        petMult: pet.mult || 1,
        petLevel: pet.level || 0,
      }
    };
  } catch (e) {
    db.exec('ROLLBACK');
    return { ok: false, code: 'error' };
  }
}

import { getDB } from '../lib/db.js';
import { incWallet, decWallet, getOrCreateUser } from '../lib/econ.js';

function ensureCrimeSchema(db){
  try {
    const cols = db.prepare('PRAGMA table_info(users)').all();
    const names = new Set(cols.map(c=>String(c.name)));
    if (!names.has('crime_heat')) db.prepare('ALTER TABLE users ADD COLUMN crime_heat INTEGER NOT NULL DEFAULT 0').run();
    if (!names.has('crime_last_at')) db.prepare('ALTER TABLE users ADD COLUMN crime_last_at INTEGER NOT NULL DEFAULT 0').run();
    if (!names.has('rob_last_at')) db.prepare('ALTER TABLE users ADD COLUMN rob_last_at INTEGER NOT NULL DEFAULT 0').run();
    if (!names.has('laylow_last_at')) db.prepare('ALTER TABLE users ADD COLUMN laylow_last_at INTEGER NOT NULL DEFAULT 0').run();
  } catch {}
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS crime_stats (
        user_id TEXT PRIMARY KEY,
        successes INTEGER NOT NULL DEFAULT 0,
        fails INTEGER NOT NULL DEFAULT 0,
        stolen_total INTEGER NOT NULL DEFAULT 0,
        lost_total INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS rob_cooldowns (
        user_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        last_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, target_id)
      );
    `);
  } catch {}
}

function now(){ return Date.now(); }

export function getCrimeState(userId){
  const db = getDB();
  ensureCrimeSchema(db);
  const u = getOrCreateUser(userId);
  // passive heat decay: -1 per HEAT_DECAY_MIN
  const decayMin = Math.max(1, Number(process.env.CRIME_HEAT_DECAY_MIN || 10));
  const last = u.crime_last_at || 0; const mins = Math.floor((now() - last) / (60*1000));
  let heat = u.crime_heat || 0;
  if (mins > 0 && heat > 0){
    const newHeat = Math.max(0, heat - Math.floor(mins / decayMin));
    if (newHeat !== heat){ db.prepare('UPDATE users SET crime_heat = ? WHERE user_id = ?').run(newHeat, userId); heat = newHeat; }
  }
  return { heat, crime_last_at: u.crime_last_at||0, rob_last_at: u.rob_last_at||0, laylow_last_at: u.laylow_last_at||0 };
}

export function addHeat(userId, delta=1){
  const db = getDB(); ensureCrimeSchema(db); getOrCreateUser(userId);
  db.prepare('UPDATE users SET crime_heat = MAX(0, crime_heat + ?), crime_last_at = ? WHERE user_id = ?').run(Math.floor(delta), now(), userId);
}

export function setCrimeLast(userId){ const db=getDB(); ensureCrimeSchema(db); db.prepare('UPDATE users SET crime_last_at = ? WHERE user_id = ?').run(now(), userId); }
export function setRobLast(userId){ const db=getDB(); ensureCrimeSchema(db); db.prepare('UPDATE users SET rob_last_at = ? WHERE user_id = ?').run(now(), userId); }
export function setLaylowLast(userId){ const db=getDB(); ensureCrimeSchema(db); db.prepare('UPDATE users SET laylow_last_at = ? WHERE user_id = ?').run(now(), userId); }

export function statsInc(userId, { success=0, fail=0, stolen=0, lost=0 }={}){
  const db = getDB(); ensureCrimeSchema(db);
  db.prepare('INSERT INTO crime_stats (user_id, successes, fails, stolen_total, lost_total) VALUES (?,0,0,0,0) ON CONFLICT(user_id) DO NOTHING').run(userId);
  if (success) db.prepare('UPDATE crime_stats SET successes = successes + ? WHERE user_id = ?').run(success, userId);
  if (fail) db.prepare('UPDATE crime_stats SET fails = fails + ? WHERE user_id = ?').run(fail, userId);
  if (stolen) db.prepare('UPDATE crime_stats SET stolen_total = stolen_total + ? WHERE user_id = ?').run(stolen, userId);
  if (lost) db.prepare('UPDATE crime_stats SET lost_total = lost_total + ? WHERE user_id = ?').run(lost, userId);
}

function hasItem(userId, name){
  const db = getDB();
  const r = db.prepare(`SELECT 1 FROM user_inventory ui JOIN shop_items si ON si.id = ui.item_id WHERE ui.user_id = ? AND si.name = ? AND ui.qty > 0`).get(userId, name);
  return !!r;
}

export function canCrime(userId){
  const { crime_last_at } = getCrimeState(userId);
  const cd = Math.max(1, Number(process.env.CRIME_COOLDOWN_SEC || 60)) * 1000;
  const remaining = Math.max(0, (crime_last_at + cd) - now());
  return { ok: remaining <= 0, remaining };
}

export function canRob(userId){
  const { rob_last_at } = getCrimeState(userId);
  const cd = Math.max(1, Number(process.env.ROB_COOLDOWN_SEC || 300)) * 1000;
  const remaining = Math.max(0, (rob_last_at + cd) - now());
  return { ok: remaining <= 0, remaining };
}

export function robSameTargetRemaining(userId, targetId){
  const db = getDB(); ensureCrimeSchema(db);
  const row = db.prepare('SELECT last_at FROM rob_cooldowns WHERE user_id = ? AND target_id = ?').get(userId, targetId);
  const cd = Math.max(1, Number(process.env.ROB_SAME_TARGET_COOLDOWN_SEC || 600)) * 1000;
  const last = row?.last_at || 0;
  const remaining = Math.max(0, (last + cd) - now());
  return remaining;
}

export function recordRobPair(userId, targetId){
  const db = getDB(); ensureCrimeSchema(db);
  db.prepare('INSERT INTO rob_cooldowns (user_id, target_id, last_at) VALUES (?, ?, ?) ON CONFLICT(user_id, target_id) DO UPDATE SET last_at = excluded.last_at')
    .run(userId, targetId, now());
}

export function attemptCrime(userId){
  const db = getDB(); ensureCrimeSchema(db); const u = getOrCreateUser(userId);
  const state = getCrimeState(userId);
  const base = Math.max(0.2, Math.min(0.95, Number(process.env.CRIME_BASE_SUCCESS || 0.6)));
  const heatPenalty = Math.min(0.25, (state.heat||0) * 0.05);
  let chance = base - heatPenalty;
  if (hasItem(userId, 'Mask')) chance += 0.10;
  if (hasItem(userId, 'Lockpick')) chance += 0.05;
  chance = Math.max(0.1, Math.min(0.95, chance));
  const success = Math.random() < chance;
  const gainMin = Number(process.env.CRIME_GAIN_MIN || 100);
  const gainMax = Number(process.env.CRIME_GAIN_MAX || 400);
  const lossMin = Number(process.env.CRIME_LOSS_MIN || 50);
  const lossMax = Number(process.env.CRIME_LOSS_MAX || 150);
  const gain = Math.floor(gainMin + Math.random()*(gainMax-gainMin+1));
  const loss = Math.floor(lossMin + Math.random()*(lossMax-lossMin+1));
  if (success){
    incWallet(userId, gain, 'crime_success');
    statsInc(userId, { success: 1 });
    setCrimeLast(userId);
    // small heat uptick chance
    if (Math.random() < 0.3) addHeat(userId, 1); else setCrimeLast(userId);
    return { ok: true, success: true, delta: gain, heat: getCrimeState(userId).heat };
  } else {
    // insurance halves loss on failed crime
    let taken = Math.min(u.wallet || 0, loss);
    if (taken > 0 && hasItem(userId, 'Insured Wallet')){
      const mult = Math.max(0.1, Math.min(1, Number(process.env.INSURE_LOSS_MULT || 0.5)));
      taken = Math.floor(taken * mult);
    }
    if (taken > 0) decWallet(userId, taken, 'crime_fail');
    addHeat(userId, 1);
    statsInc(userId, { fail: 1, lost: taken });
    setCrimeLast(userId);
    return { ok: true, success: false, delta: -taken, heat: getCrimeState(userId).heat };
  }
}

export function attemptRob(userId, targetId){
  const db = getDB(); ensureCrimeSchema(db);
  const a = getOrCreateUser(userId); const b = getOrCreateUser(targetId);
  const minSelf = Number(process.env.ROB_MIN_SELF || 100);
  const minVictim = Number(process.env.ROB_MIN_TARGET || 250);
  if ((a.wallet||0) < minSelf) return { ok: false, code: 'self_min' };
  if ((b.wallet||0) < minVictim) return { ok: false, code: 'target_min' };
  // cooldowns
  const can1 = canRob(userId); if (!can1.ok) return { ok: false, code: 'cooldown', remaining: can1.remaining };
  const sameRem = robSameTargetRemaining(userId, targetId); if (sameRem > 0) return { ok: false, code: 'same_target', remaining: sameRem };

  const state = getCrimeState(userId);
  let chance = Math.max(0.1, Math.min(0.9, Number(process.env.ROB_BASE_SUCCESS || 0.5)));
  chance -= Math.min(0.25, (state.heat||0) * 0.05);
  if (hasItem(userId, 'Mask')) chance += 0.10;
  if (hasItem(userId, 'Lockpick')) chance += 0.15;
  chance = Math.max(0.1, Math.min(0.95, chance));

  const maxPct = Math.max(0.05, Math.min(0.5, Number(process.env.ROB_MAX_STEAL_PCT || 0.2)));
  const cap = Math.max(50, Number(process.env.ROB_STEAL_CAP || 500));
  const minSteal = Math.max(25, Number(process.env.ROB_MIN_STEAL || 50));
  const stealMax = Math.min(cap, Math.floor((b.wallet||0) * maxPct));
  const attemptAmt = Math.max(minSteal, Math.floor(minSteal + Math.random() * Math.max(0, stealMax - minSteal + 1)));
  const succeed = Math.random() < chance;

  if (succeed){
    let amt = Math.min(b.wallet||0, attemptAmt);
    // victim insurance halves loss
    if (amt > 0 && hasItem(targetId, 'Insured Wallet')){
      const mult = Math.max(0.1, Math.min(1, Number(process.env.INSURE_LOSS_MULT || 0.5)));
      amt = Math.floor(amt * mult);
    }
    if (amt > 0){
      decWallet(targetId, amt, 'robbery_loss');
      incWallet(userId, amt, 'robbery_gain');
    }
    statsInc(userId, { success: 1, stolen: amt });
    recordRobPair(userId, targetId);
    setRobLast(userId);
    // small heat bump
    addHeat(userId, 1);
    return { ok: true, success: true, amt };
  } else {
    const finePct = Math.max(0.1, Math.min(0.9, Number(process.env.ROB_FAIL_FINE_PCT || 0.5)));
    const fine = Math.floor(attemptAmt * finePct);
    const pay = Math.min(a.wallet||0, fine);
    if (pay > 0){ decWallet(userId, pay, 'robbery_fine'); incWallet(targetId, pay, 'robbery_comp'); }
    statsInc(userId, { fail: 1, lost: pay });
    addHeat(userId, 2);
    recordRobPair(userId, targetId);
    setRobLast(userId);
    return { ok: true, success: false, amt: pay };
  }
}

export function layLow(userId){
  const state = getCrimeState(userId);
  const { laylow_last_at } = state;
  const cd = Math.max(1, Number(process.env.LAYLOW_COOLDOWN_SEC || 300)) * 1000;
  const remaining = Math.max(0, (laylow_last_at + cd) - now());
  if (remaining > 0) return { ok: false, code: 'cooldown', remaining };
  const reduce = Math.max(1, Number(process.env.LAYLOW_REDUCE || 2));
  const db = getDB(); ensureCrimeSchema(db);
  getOrCreateUser(userId);
  db.prepare('UPDATE users SET crime_heat = MAX(0, crime_heat - ?), laylow_last_at = ? WHERE user_id = ?').run(reduce, now(), userId);
  return { ok: true, reduce, heat: getCrimeState(userId).heat };
}

export function getCrimeProfile(userId){
  const db = getDB(); ensureCrimeSchema(db);
  const u = getOrCreateUser(userId);
  const s = db.prepare('SELECT successes, fails, stolen_total, lost_total FROM crime_stats WHERE user_id = ?').get(userId) || { successes: 0, fails: 0, stolen_total: 0, lost_total: 0 };
  return { heat: getCrimeState(userId).heat, successes: s.successes, fails: s.fails, stolen: s.stolen_total, lost: s.lost_total, crime_last_at: u.crime_last_at, rob_last_at: u.rob_last_at };
}

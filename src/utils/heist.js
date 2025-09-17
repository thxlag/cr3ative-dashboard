import { decWallet, incWallet, getOrCreateUser } from '../lib/econ.js';

const heists = new Map(); // msgId -> state

export function createHeist({ msgId, ownerId, bet, durationMs }){
  heists.set(msgId, { id: msgId, ownerId, bet, endsAt: Date.now()+durationMs, members: new Map(), started: false });
}
export function getHeist(msgId){ return heists.get(msgId); }
export function clearHeist(msgId){ heists.delete(msgId); }

export function joinHeist(heist, userId){
  if (heist.started) return { ok: false, code: 'started' };
  if (heist.members.has(userId)) return { ok: false, code: 'already' };
  const u = getOrCreateUser(userId); if ((u.wallet||0) < heist.bet) return { ok: false, code: 'funds' };
  const ok = decWallet(userId, heist.bet, 'heist_bet'); if (!ok) return { ok: false, code: 'funds' };
  heist.members.set(userId, { role: null });
  return { ok: true };
}

export function setRole(heist, userId, role){ if (heist.members.has(userId)){ heist.members.get(userId).role = role; return true; } return false; }

export function startHeist(heist){ heist.started = true; }

export function resolveHeist(heist){
  const req = new Set(['driver','hacker','inside']);
  for (const {role} of heist.members.values()){ if (role) req.delete(role); }
  const haveAll = req.size === 0;
  let baseChance = haveAll ? 0.7 : 0.45;
  // small bonus for extra members beyond 3
  baseChance += Math.min(0.2, Math.max(0, heist.members.size - 3) * 0.03);
  const success = Math.random() < baseChance;
  const pool = heist.bet * heist.members.size;
  const shares = new Map();
  if (success){
    let mult = haveAll ? 1.8 : 1.3;
    const payout = Math.floor(pool * mult);
    const per = Math.max(1, Math.floor(payout / heist.members.size));
    for (const uid of heist.members.keys()) shares.set(uid, per);
  } else {
    for (const uid of heist.members.keys()) shares.set(uid, 0);
  }
  // pay
  for (const [uid, amt] of shares.entries()) if (amt>0) incWallet(uid, amt, 'heist_win');
  return { success, pool, shares };
}


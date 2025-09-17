import { decWallet, incWallet, getOrCreateUser } from '../lib/econ.js';

const races = new Map(); // msgId -> { ownerId, bet, endsAt, players: [userId], started }

export function createRace({ msgId, ownerId, bet, durationMs }){
  races.set(msgId, { id: msgId, ownerId, bet, endsAt: Date.now() + durationMs, players: [], started: false });
}
export function getRace(msgId){ return races.get(msgId); }
export function clearRace(msgId){ races.delete(msgId); }

export function joinRace(race, userId){
  if (race.started) return { ok: false, code: 'started' };
  if (race.players.includes(userId)) return { ok: false, code: 'already' };
  const u = getOrCreateUser(userId);
  if ((u.wallet||0) < race.bet) return { ok: false, code: 'funds' };
  const ok = decWallet(userId, race.bet, 'race_bet');
  if (!ok) return { ok: false, code: 'funds' };
  race.players.push(userId);
  return { ok: true };
}

export function startRace(race){ race.started = true; }

export function resolveRace(race){
  const players = [...race.players];
  if (players.length < 2) return { ok: false, code: 'need_players' };
  // random shuffle placements
  for (let i=players.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [players[i],players[j]]=[players[j],players[i]]; }
  const winner = players[0];
  const pool = race.bet * race.players.length;
  incWallet(winner, Math.floor(pool*0.9), 'race_win'); // 10% house for sinks
  return { ok: true, winner, placements: players, pool };
}


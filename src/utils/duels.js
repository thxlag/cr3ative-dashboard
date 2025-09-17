import { incWallet, decWallet, getOrCreateUser } from '../lib/econ.js';

const duels = new Map(); // msgId -> state

export function createDuel({ msgId, challengerId, targetId, bet }){
  duels.set(msgId, { id: msgId, challengerId, targetId, bet, status: 'pending' });
}

export function getDuel(msgId){ return duels.get(msgId); }

export function clearDuel(msgId){ duels.delete(msgId); }

export function canAfford(userId, amount){
  const u = getOrCreateUser(userId);
  return (u.wallet||0) >= amount;
}

export function acceptDuel(msgId){
  const d = duels.get(msgId); if (!d) return { ok: false };
  d.status = 'accepted';
  return { ok: true, duel: d };
}

export function resolveDuel(d){
  // best of 3 coin toss for simplicity
  let a = 0, b = 0;
  const rounds = [];
  for (let i=0;i<3;i++){
    const r = Math.random() < 0.5 ? 'A' : 'B';
    if (r === 'A') { a++; rounds.push('🪙 A'); } else { b++; rounds.push('🪙 B'); }
    if (a === 2 || b === 2) break;
  }
  const winner = a > b ? d.challengerId : d.targetId;
  const loser = a > b ? d.targetId : d.challengerId;
  return { winner, loser, rounds };
}

export function escrowAndPayout(d){
  const ok1 = decWallet(d.challengerId, d.bet, 'duel_bet');
  const ok2 = decWallet(d.targetId, d.bet, 'duel_bet');
  if (!ok1 || !ok2){
    // refund if one failed
    if (ok1) incWallet(d.challengerId, d.bet, 'duel_refund');
    if (ok2) incWallet(d.targetId, d.bet, 'duel_refund');
    return { ok: false };
  }
  const pot = d.bet * 2;
  return { ok: true, pot };
}

export function payoutWinner(userId, amount){ incWallet(userId, amount, 'duel_win'); }


// src/utils/mines.js
import crypto from 'node:crypto';
import { incWallet } from '../lib/econ.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getDB } from '../lib/db.js';

const rounds = new Map(); // roundId -> state
let expiryTimer = null;

function randInt(max){ return Math.floor(crypto.randomInt(0, max)); }

function generateBoard(mines, size = 4){
  const total = size*size;
  const bomb = new Set();
  const idxs = [...Array(total).keys()];
  for (let i=0;i<mines;i++){
    const j = randInt(idxs.length);
    bomb.add(idxs.splice(j,1)[0]);
  }
  return { size, bomb };
}

function multiplier(picks, mines){
  if (picks <= 0) return 0;
  const total = 25; const safe = total - mines;
  let m = 1;
  for (let k=0;k<picks;k++){
    const totalRem = total - k;
    const safeRem = safe - k;
    if (safeRem <= 0) return m;
    m *= totalRem / safeRem;
  }
  const rtp = Math.min(0.99, Math.max(0.50, Number(process.env.MINES_RTP || 0.96)));
  return m * rtp;
}

export function createRound({ userId, bet, mines, guildId }){
  const id = crypto.randomBytes(8).toString('hex');
  const { size, bomb } = generateBoard(mines, 4);
  const seed = crypto.randomBytes(16).toString('hex');
  const commit = crypto.createHash('sha256').update(seed + '|' + [...bomb].join(',')).digest('hex');
  const state = {
    id, userId, bet, mines, guildId,
    size,
    bomb,
    revealed: new Set(),
    createdAt: Date.now(),
    seed,
    commit,
    ended: false,
    paid: 0,
    embedMsgId: null,
    msgId: null,
    cashMsgId: null,
  };
  rounds.set(id, state);
  try {
    const db = getDB();
    db.prepare(`
      INSERT INTO mines_rounds (round_id, guild_id, user_id, bet, mines, created_at, ended, commit_hash)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, guildId || null, userId, bet, mines, state.createdAt, commit);
  } catch {}
  return state;
}

export function getRound(id){ return rounds.get(id); }

export function boardText(state, revealAll=false){
  const rows = [];
  for (let r=0;r<state.size;r++){
    const line = [];
    for (let c=0;c<state.size;c++){
      const idx = r*state.size + c;
      const revealed = state.revealed.has(idx) || (revealAll && state.bomb.has(idx));
      if (!revealed) line.push('□');
      else if (state.bomb.has(idx)) line.push('X');
      else line.push('■');
    }
    rows.push(line.join(' '));
  }
  return rows.join('\n');
}

export function unrevealedOptions(state){
  const opts = [];
  for (let r=0;r<state.size;r++){
    for (let c=0;c<state.size;c++){
      const idx = r*state.size + c;
      if (state.revealed.has(idx)) continue;
      const label = String.fromCharCode(65+r) + (c+1);
      opts.push({ label, value: `${r},${c}` });
    }
  }
  return opts.slice(0,25);
}

export function reveal(state, r, c){
  if (state.ended) return { ended: true };
  const idx = r*state.size + c;
  if (state.revealed.has(idx)) return { ignore: true };
  if (state.bomb.has(idx)){
    state.ended = true;
    return { bomb: true };
  }
  state.revealed.add(idx);
  return { bomb: false };
}

export function currentPayout(state){
  const picks = state.revealed.size;
  const win = picks > 0 ? Math.floor(state.bet * (1 + picks * 0.45)) : 0;
  return { picks, mult: 0, win };
}

export function cashout(state){
  if (state.ended) return { ok: false };
  const { win } = currentPayout(state);
  state.ended = true;
  state.paid = win;
  if (win > 0) incWallet(state.userId, win, 'mines_cashout');
  try {
    const db = getDB();
    db.prepare('UPDATE mines_rounds SET ended = 1 WHERE round_id = ?').run(state.id);
  } catch {}
  return { ok: true, win };
}

export function boardButtons(state, { revealAll = false } = {}){
  const rows = [];
  for (let r=0; r<state.size; r++){
    const row = new ActionRowBuilder();
    for (let c=0; c<state.size; c++){
      const idx = r*state.size + c;
      const isRevealed = state.revealed.has(idx);
      const isBomb = state.bomb.has(idx);
      const b = new ButtonBuilder()
        .setCustomId(`mines:${state.id}:btn:${r},${c}`)
        .setStyle(ButtonStyle.Secondary);
      if (state.ended) {
        b.setDisabled(true);
        if (isBomb) b.setEmoji('💣');
        else if (isRevealed) b.setEmoji('💎');
        else b.setLabel('▢');
      } else if (revealAll) {
        if (isBomb) b.setEmoji('💣').setDisabled(true);
        else if (isRevealed) b.setEmoji('💎').setDisabled(true);
        else b.setLabel('▢');
      } else {
        if (isRevealed) {
          b.setEmoji('💎').setDisabled(true);
        } else {
          b.setLabel('▢');
        }
      }
      row.addComponents(b);
    }
    rows.push(row);
  }
  return rows;
}

export function cashRow(state, payout){
  const cash = new ButtonBuilder()
    .setCustomId(`mines:${state.id}:cash`)
    .setLabel(payout ? `Cash Out (${payout})` : 'Cash Out')
    .setStyle(ButtonStyle.Success)
    .setDisabled(state.ended || state.revealed.size === 0);
  return new ActionRowBuilder().addComponents(cash);
}

// Expire old rounds from memory and DB
export function pruneExpiredRounds(ttlMin = Number(process.env.MINES_ROUND_TTL_MIN || 15)){
  const now = Date.now();
  const ttlMs = Math.max(1, ttlMin) * 60 * 1000;
  const db = getDB();
  // Memory cleanup
  for (const [id, st] of rounds.entries()){
    if (now - (st.createdAt || 0) > ttlMs) rounds.delete(id);
  }
  try {
    db.prepare('DELETE FROM mines_rounds WHERE created_at < ?').run(now - ttlMs);
  } catch {}
}

export function setupMinesExpiry(){
  if (expiryTimer) return; // already set
  // initial prune
  try { pruneExpiredRounds(); } catch {}
  expiryTimer = setInterval(() => {
    try { pruneExpiredRounds(); } catch {}
  }, 5 * 60 * 1000); // every 5 minutes
}

export function againRow(userId, bet, mines){
  const a = new ButtonBuilder().setCustomId(`mines:again:${userId}:${bet}:${mines}`).setLabel('Again').setStyle(ButtonStyle.Primary);
  const s = new ButtonBuilder().setCustomId(`slots:prompt:${userId}:${bet}`).setLabel('Slots').setStyle(ButtonStyle.Secondary);
  const b = new ButtonBuilder().setCustomId(`bj:prompt:${userId}:${bet}`).setLabel('Blackjack').setStyle(ButtonStyle.Secondary);
  return new ActionRowBuilder().addComponents(a, s, b);
}

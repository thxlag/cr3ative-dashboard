import crypto from 'node:crypto';
import { incWallet } from '../lib/econ.js';
import { addGamblingProfitToPool } from './lottery.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const ROUNDS = new Map();

const values = { 'A': 11, 'K': 10, 'Q': 10, 'J': 10, '10':10, '9':9, '8':8, '7':7, '6':6, '5':5, '4':4, '3':3, '2':2 };
const ranks = Object.keys(values);
const suits = ['♠','♥','♦','♣'];

function newDeck(){
  const deck = [];
  for (const r of ranks){ for (const s of suits){ deck.push(`${r}${s}`); } }
  return deck;
}

function shuffle(arr, seed){
  const rng = crypto.createHash('sha256').update(seed).digest();
  let i = 0; const r = () => rng[i++ % rng.length] / 255;
  for (let j=arr.length-1;j>0;j--){ const k = Math.floor(r() * (j+1)); [arr[j], arr[k]] = [arr[k], arr[j]]; }
  return arr;
}

function handValue(cards){
  let total = 0; let aces = 0;
  for (const c of cards){ const r = c.slice(0, -1); total += values[r]; if (r==='A') aces++; }
  while (total > 21 && aces>0){ total -= 10; aces--; }
  return total;
}

export function createBJRound({ userId, bet, guildId }){
  const id = crypto.randomBytes(8).toString('hex');
  const seed = crypto.randomBytes(16).toString('hex');
  const commit = crypto.createHash('sha256').update(seed).digest('hex');
  const deck = shuffle(newDeck(), seed);
  const round = {
    id, userId, bet, guildId,
    seed, commit,
    deck, idx: 0,
    player: [], dealer: [],
    ended: false, paid: 0, msgId: null,
  };
  // initial deal
  round.player.push(deck[round.idx++]);
  round.dealer.push(deck[round.idx++]);
  round.player.push(deck[round.idx++]);
  round.dealer.push(deck[round.idx++]);
  ROUNDS.set(id, round);
  return round;
}

export function bjButtons(round){
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bj:hit:${round.id}`).setLabel('Hit').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bj:stand:${round.id}`).setLabel('Stand').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bj:dbl:${round.id}`).setLabel('Double').setStyle(ButtonStyle.Secondary)
  );
  return row;
}

export function bjAgainButtons(userId, bet){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bj:again:${userId}:${bet}`).setLabel('Again').setStyle(ButtonStyle.Primary)
  );
}

export function bjRender(round, { revealDealer = false } = {}){
  const pv = handValue(round.player);
  const dv = handValue(round.dealer);
  const dShow = revealDealer ? round.dealer.join(' ') : `${round.dealer[0]} ??`;
  const lines = [
    `Commit: ${round.commit.slice(0,8)}…`,
    `Dealer: ${dShow} ${revealDealer?`= ${dv}`:''}`,
    `You:    ${round.player.join(' ')} = ${pv}`,
  ];
  return lines.join('\n');
}

function draw(round, to){ to.push(round.deck[round.idx++]); }

function finishDealer(round){
  while (handValue(round.dealer) < 17){ draw(round, round.dealer); }
}

export function applyAction(round, action){
  if (round.ended) return { ended: true };
  if (action === 'hit'){
    draw(round, round.player);
    if (handValue(round.player) > 21){
      round.ended = true;
      settle(round);
      return { ended: true, bust: true };
    }
    return { ended: false };
  }
  if (action === 'dbl'){
    // double: draw one and stand; bet doubles if affordable (we already deducted initial bet; double paid on win)
    draw(round, round.player);
    round.bet *= 2;
    round.double = true;
    finishDealer(round);
    round.ended = true;
    settle(round);
    return { ended: true };
  }
  if (action === 'stand'){
    finishDealer(round);
    round.ended = true;
    settle(round);
    return { ended: true };
  }
  return { ended: false };
}

function settle(round){
  const pv = handValue(round.player);
  const dv = handValue(round.dealer);
  let win = 0;
  // Slightly lower house fee by default (was 0.02 → 0.01)
  const feePct = Math.max(0, Math.min(0.05, Number(process.env.BJ_FEE_PCT || 0.01)));
  if (pv > 21){ win = 0; }
  else if (dv > 21){ win = round.bet * (1 - feePct) * 2; }
  else if (pv > dv){ win = round.bet * (1 - feePct) * 2; }
  else if (pv === 21 && round.player.length === 2 && !(dv===21 && round.dealer.length===2)){
    // natural blackjack 3:2
    win = Math.floor(round.bet * (1 - feePct) * 2.5);
  } else if (pv === dv){ win = round.bet; } // push
  else { win = 0; }
  round.paid = Math.floor(win);
}

export function finalizePayout(round){
  const win = Math.floor(round.paid || 0);
  if (win > 0){ incWallet(round.userId, win, 'bj_win'); }
  const net = win - (round.bet || 0);
  if (net < 0) try { addGamblingProfitToPool(round.guildId, -net); } catch {}
  return net;
}

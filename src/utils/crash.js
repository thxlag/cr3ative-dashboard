// src/utils/crash.js
import crypto from 'node:crypto';
import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { incWallet } from '../lib/econ.js';
import { addGamblingProfitToPool } from './lottery.js';

const rounds = new Map(); // roundId -> state

function id() { return crypto.randomBytes(8).toString('hex'); }

function randomCrashPoint() {
  // Exponential-like distribution, clamped [1.02, 10.0]
  const r = Math.random();
  const x = 1.02 + Math.log(1/(1 - r)) * 0.6; // mean ~2.0–3.0x
  return Math.max(1.02, Math.min(10.0, x));
}

export function createCrashRound({ userId, bet, guildId }){
  const round = {
    id: id(),
    userId,
    guildId,
    bet,
    startedAt: Date.now(),
    multiplier: 1.0,
    bustAt: randomCrashPoint(),
    ended: false,
    cashed: false,
    msgId: null,
    channelId: null,
    timer: null,
  };
  rounds.set(round.id, round);
  return round;
}

export function getCrashRound(rid){ return rounds.get(rid) || null; }

export function cashButton(round){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`crash:cash:${round.id}`)
      .setStyle(ButtonStyle.Success)
      .setLabel('Cash Out')
      .setDisabled(round.ended || round.cashed)
  );
}

export function againButton(userId, bet){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`crash:again:${userId}:${bet}`).setStyle(ButtonStyle.Primary).setLabel('Again')
  );
}

function buildEmbed(round, { status = 'Spinning…' } = {}){
  const e = new EmbedBuilder()
    .setTitle('🚀 Crash')
    .setDescription((() => {
      const prog = Math.max(0, Math.min(1, (round.multiplier - 1) / Math.max(0.01, (round.bustAt - 1))));
      const steps = 20;
      const pos = Math.max(0, Math.min(steps - 1, Math.round(prog * (steps - 1))));
      const bar = `${'·'.repeat(pos)}🚀${'·'.repeat(Math.max(0, steps - 1 - pos))}`;
      return [
        `Multiplier: **${round.multiplier.toFixed(2)}×** (bust at ~${round.bustAt.toFixed(2)}×)`,
        `Bet: **${round.bet}**`,
        `Progress: [${bar}]`,
        status,
      ].join('\n');
    })())
    .setTimestamp(Date.now());
  return e;
}

export function startCrashTicker(client, round){
  // Reach bustAt in ~8 seconds, quadratic growth for drama
  const totalMs = 8000;
  const start = Date.now();
  round.editing = false;

  const tick = async () => {
    if (round.ended) return;
    const t = Math.max(0, Math.min(1, (Date.now() - start) / totalMs));
    // quadratic curve: 1 + (bustAt-1) * t^2
    round.multiplier = 1 + (round.bustAt - 1) * (t * t);

    // coalesce edits: skip if a previous edit still in-flight
    if (!round.editing){
      round.editing = true;
      try {
        const ch = client.channels.cache.get(round.channelId);
        if (ch?.isTextBased?.()){
          const comps = [cashButton(round)];
          await ch.messages.edit(round.msgId, { embeds: [buildEmbed(round)], components: comps }).catch(()=>{});
        }
      } catch {}
      round.editing = false;
    }

    if (round.multiplier >= round.bustAt - 0.0001){
      // Bust
      round.ended = true;
      if (round.timer) { clearTimeout(round.timer); round.timer = null; }
      try {
        const ch = client.channels.cache.get(round.channelId);
        if (ch?.isTextBased?.()){
          const comps = [againButton(round.userId, round.bet)];
          const e = buildEmbed(round, { status: `💥 Bust at ${round.bustAt.toFixed(2)}× — lost **${round.bet}**` });
          await ch.messages.edit(round.msgId, { embeds: [e], components: comps }).catch(()=>{});
        }
      } catch {}
      try { addGamblingProfitToPool(round.guildId, round.bet); } catch {}
      return;
    }

    // schedule next frame
    round.timer = setTimeout(tick, 150);
  };

  // kick off after short delay to ensure msgId is set
  round.timer = setTimeout(tick, 150);
}

export function cashOut(round){
  if (!round || round.ended) return { ok: false };
  round.ended = true;
  round.cashed = true;
  clearInterval(round.timer); round.timer = null;
  const rtp = Math.min(0.99, Math.max(0.50, Number(process.env.CRASH_RTP || 0.95)));
  const win = Math.floor(round.bet * round.multiplier * rtp);
  try { if (win > 0) incWallet(round.userId, win, 'crash_win'); } catch {}
  // Add house profit if any (bet > win)
  try { if (round.bet > win) addGamblingProfitToPool(round.guildId, round.bet - win); } catch {}
  return { ok: true, win };
}

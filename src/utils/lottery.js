import { getDB } from '../lib/db.js';
import { incWallet } from '../lib/econ.js';
import { EmbedBuilder } from 'discord.js';

let LOT_READY = false;
const lotTimers = new Map(); // guildId -> timeout
function ensureLotteryTables(){
  if (LOT_READY) return;
  const db = getDB();
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS lottery_state (
        guild_id TEXT PRIMARY KEY,
        pool INTEGER NOT NULL DEFAULT 0,
        role_id TEXT,
        last_winner_user_id TEXT,
        last_win_amount INTEGER,
        last_draw_ts INTEGER
      );
      CREATE TABLE IF NOT EXISTS lottery_active (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT,
        started_by TEXT,
        started_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS lottery_entries (
        guild_id TEXT NOT NULL,
        user_id  TEXT NOT NULL,
        tickets  INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (guild_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_lottery_entries_guild ON lottery_entries (guild_id);
    `);
    // ensure end_at column exists
    try {
      const cols = db.prepare("PRAGMA table_info(lottery_active)").all();
      const hasEnd = cols.some(c => String(c.name).toLowerCase() === 'end_at');
      if (!hasEnd) db.prepare('ALTER TABLE lottery_active ADD COLUMN end_at INTEGER').run();
    } catch {}
    LOT_READY = true;
  } catch {}
}

export function getLotteryState(guildId){
  ensureLotteryTables();
  const db = getDB();
  const row = db.prepare('SELECT pool, role_id, last_winner_user_id, last_win_amount, last_draw_ts FROM lottery_state WHERE guild_id = ?').get(guildId);
  if (row) return row;
  db.prepare('INSERT INTO lottery_state (guild_id, pool) VALUES (?, 0)').run(guildId);
  return { pool: 0, role_id: null, last_winner_user_id: null, last_win_amount: 0, last_draw_ts: null };
}

export function addToLotteryPool(guildId, amount){
  ensureLotteryTables();
  if (!guildId) return;
  const amt = Math.max(0, Math.floor(amount || 0));
  if (!amt) return;
  const db = getDB();
  getLotteryState(guildId);
  db.prepare('UPDATE lottery_state SET pool = pool + ? WHERE guild_id = ?').run(amt, guildId);
}

// Dynamic share for routing gambling profit to the lottery pool.
// Uses min/max pct and scales down as pool approaches a target size; adjusts by current engagement (entries).
export function computePoolShare(guildId){
  try {
    const minPct = Math.max(0, Math.min(1, Number(process.env.LOTTERY_POOL_MIN_PCT || 0.25)));
    const maxPct = Math.max(minPct, Math.min(1, Number(process.env.LOTTERY_POOL_MAX_PCT || 0.50)));
    const target = Math.max(100, Number(process.env.LOTTERY_TARGET_POOL || 5000));
    const st = getLotteryState(guildId);
    const p = Math.max(0, Number(st.pool || 0));
    // Share decreases as pool nears target
    const ratio = Math.max(0, Math.min(1, p / target));
    let share = maxPct - (maxPct - minPct) * ratio;
    // Engagement factor: scale by number of current entries (0..10 -> 0.6..1.0)
    const db = getDB();
    let entries = 0;
    try { entries = db.prepare('SELECT COUNT(*) AS c FROM lottery_entries WHERE guild_id = ?').get(guildId)?.c || 0; } catch {}
    const engFactor = 0.6 + 0.4 * Math.max(0, Math.min(1, entries / 10));
    share = Math.max(minPct, Math.min(maxPct, share * engFactor));
    return share;
  } catch {
    return Math.max(0, Math.min(1, Number(process.env.LOTTERY_POOL_MIN_PCT || 0.25)));
  }
}

// Add a portion of gambling profit to pool; remainder is burned/house
export function addGamblingProfitToPool(guildId, profitAmount){
  const amt = Math.max(0, Math.floor(profitAmount || 0));
  if (!amt) return;
  const share = computePoolShare(guildId);
  const portion = Math.max(0, Math.floor(amt * share));
  if (portion) addToLotteryPool(guildId, portion);
}

export function setLotteryRole(guildId, roleId){
  ensureLotteryTables();
  const db = getDB();
  getLotteryState(guildId);
  db.prepare('UPDATE lottery_state SET role_id = ? WHERE guild_id = ?').run(roleId || null, guildId);
}

export function isLotteryActive(guildId){
  ensureLotteryTables();
  const db = getDB();
  const row = db.prepare('SELECT 1 FROM lottery_active WHERE guild_id = ?').get(guildId);
  return !!row;
}

export function startLottery(guild, { channelId, startedBy, durationMin }){
  ensureLotteryTables();
  const db = getDB();
  if (isLotteryActive(guild.id)) return { ok: false, reason: 'active' };
  const now = Date.now();
  const defaultChannel = process.env.LOTTERY_CHANNEL_ID || null;
  const targetChannelId = channelId || defaultChannel || null;
  const durMin = Number(durationMin || process.env.LOTTERY_DURATION_MIN || 60);
  const endAt = now + Math.max(1, Math.min(durMin, 1440)) * 60 * 1000; // up to 24h
  db.prepare('INSERT INTO lottery_active (guild_id, channel_id, started_by, started_at, end_at) VALUES (?, ?, ?, ?, ?)')
    .run(guild.id, targetChannelId, startedBy || 'system', now, endAt);

  const state = getLotteryState(guild.id);
  const ch = targetChannelId ? guild.channels.cache.get(targetChannelId) : null;
  const roleId = state.role_id || process.env.LOTTERY_PING_ROLE_ID || null;
  const roleMention = roleId ? `<@&${roleId}>` : '';
  const embed = new EmbedBuilder()
    .setTitle('🎟️ Lottery Started')
    .setDescription(`Jackpot: **${state.pool}** coins\nEnds <t:${Math.floor(endAt/1000)}:R>\nUse /lottery enter to join. Good luck!`)
    .setTimestamp(now);
  try { (ch?.isTextBased?.() ? ch : guild.systemChannel)?.send({ content: roleMention, embeds: [embed] }); } catch {}
  try { scheduleLotteryEnd(guild.client, guild.id); } catch {}
  return { ok: true };
}

export function enterLottery(guildId, userId, tickets = 1){
  ensureLotteryTables();
  const db = getDB();
  if (!isLotteryActive(guildId)) return { ok: false, reason: 'inactive' };
  const n = Math.max(1, Math.floor(tickets || 1));
  db.prepare(`
    INSERT INTO lottery_entries (guild_id, user_id, tickets)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET tickets = lottery_entries.tickets + excluded.tickets
  `).run(guildId, userId, n);
  return { ok: true };
}

export function endLottery(guild){
  ensureLotteryTables();
  const db = getDB();
  const active = db.prepare('SELECT channel_id FROM lottery_active WHERE guild_id = ?').get(guild.id) || { channel_id: null };
  const entries = db.prepare('SELECT user_id, tickets FROM lottery_entries WHERE guild_id = ?').all(guild.id);
  const state = getLotteryState(guild.id);
  const pool = Number(state.pool || 0);
  let winner = null;
  if (entries.length && pool > 0){
    const total = entries.reduce((a,b)=> a + (b.tickets||0), 0);
    let r = Math.random() * total;
    for (const e of entries){ r -= e.tickets; if (r <= 0){ winner = e.user_id; break; } }
  }

  // record and payout
  if (winner && pool > 0){
    try { incWallet(winner, pool, 'lottery_win'); } catch {}
    try { db.prepare('INSERT INTO lottery_wins (guild_id, user_id, amount, at_ts) VALUES (?, ?, ?, ?)').run(guild.id, winner, pool, Date.now()); } catch {}
    db.prepare('UPDATE lottery_state SET pool = 0, last_winner_user_id = ?, last_win_amount = ?, last_draw_ts = ? WHERE guild_id = ?')
      .run(winner, pool, Date.now(), guild.id);
  }

  // cleanup active + entries
  db.prepare('DELETE FROM lottery_entries WHERE guild_id = ?').run(guild.id);
  db.prepare('DELETE FROM lottery_active WHERE guild_id = ?').run(guild.id);
  const t = lotTimers.get(guild.id); if (t) { clearTimeout(t); lotTimers.delete(guild.id); }

  // announce
  try {
    const defaultChannel = process.env.LOTTERY_CHANNEL_ID || null;
    const targetChannelId = active.channel_id || defaultChannel;
    const ch = targetChannelId ? guild.channels.cache.get(targetChannelId) : null;
    const roleId = state.role_id || process.env.LOTTERY_PING_ROLE_ID || null;
    const roleMention = roleId ? `<@&${roleId}>` : '';
    const embed = new EmbedBuilder()
      .setTitle('🎟️ Lottery Ended')
      .setTimestamp(Date.now());
    if (winner) embed.setDescription(`Winner: <@${winner}>\nPrize: **${pool}** coins`);
    else embed.setDescription('No entries this round. Pool carries over.');
    if (ch?.isTextBased?.()) { try { ch.send({ content: roleMention, embeds: [embed] }); } catch {} }
  } catch {}

  return { ok: true, winner, amount: winner ? pool : 0 };
}

export function setupLotteryScheduler(client){
  try {
    ensureLotteryTables();
    const db = getDB();
    const rows = db.prepare('SELECT guild_id FROM lottery_active').all();
    for (const r of rows){ scheduleLotteryEnd(client, r.guild_id); }
  } catch {}
}

function scheduleLotteryEnd(client, guildId){
  try {
    ensureLotteryTables();
    const db = getDB();
    const row = db.prepare('SELECT end_at FROM lottery_active WHERE guild_id = ?').get(guildId);
    if (!row?.end_at) return;
    const ms = Math.max(0, row.end_at - Date.now());
    const old = lotTimers.get(guildId); if (old) clearTimeout(old);
    const t = setTimeout(async () => {
      try {
        const guild = await client.guilds.fetch(guildId).catch(()=>null);
        if (!guild) return;
        endLottery(guild);
      } catch {}
    }, ms);
    lotTimers.set(guildId, t);
  } catch {}
}

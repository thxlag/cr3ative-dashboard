
import { getDB } from '../lib/db.js';
import { EmbedBuilder } from 'discord.js';
import { incWallet } from '../lib/econ.js';
import { addXp } from './leveling.js';

const timers = new Map(); // guildId -> timeout
const activity = new Map(); // guildId -> Map<userId, lastTs>
const autoState = new Map(); // guildId -> { lastStart: number, lastEnd: number }

// --- Self-healing Table Creation ---
function ensureTables() {
    const db = getDB();
    db.exec(`
        CREATE TABLE IF NOT EXISTS events_active (
            guild_id   TEXT PRIMARY KEY,
            event_name TEXT NOT NULL,
            multiplier REAL NOT NULL DEFAULT 1.0,
            started_by TEXT,
            channel_id TEXT,
            start_ts   INTEGER NOT NULL,
            end_ts     INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS events_meta (
            guild_id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            config_json TEXT
        );
        CREATE TABLE IF NOT EXISTS event_progress (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            metric TEXT NOT NULL,
            value INTEGER NOT NULL DEFAULT 0,
            completed_ts INTEGER,
            PRIMARY KEY (guild_id, user_id, metric)
        );
        CREATE TABLE IF NOT EXISTS event_results (
            guild_id   TEXT NOT NULL,
            event_name TEXT NOT NULL,
            user_id    TEXT NOT NULL,
            score      INTEGER NOT NULL DEFAULT 1,
            at_ts      INTEGER NOT NULL,
            PRIMARY KEY (guild_id, event_name, user_id, at_ts)
        );
    `);
}

ensureTables(); // Run on module load

export function getActiveEvent(guildId) {
  const db = getDB();
  const now = Date.now();
  const row = db.prepare(`
    SELECT * FROM events_active WHERE guild_id = ? AND end_ts > ?
  `).get(guildId, now);
  return row || null;
}

// Quest Burst helpers
export function setBurstConfig(guildId, type, config) {
  const db = getDB();
  db.prepare(`
    INSERT INTO events_meta (guild_id, type, config_json)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET type=excluded.type, config_json=excluded.config_json
  `).run(guildId, type, JSON.stringify(config || {}));
}

export function getBurstConfig(guildId) {
  const db = getDB();
  const row = db.prepare('SELECT type, config_json FROM events_meta WHERE guild_id = ?').get(guildId);
  if (!row) return null;
  if (row.type !== 'quest_burst') return null;
  try { return JSON.parse(row.config_json || '{}') || {}; } catch { return {}; }
}

export function startBurstEvent(guild, { durationMin, channelId, startedBy, goals, winners = 3, prizes = { coins: [1000, 600, 400], xp: [0, 0, 0] } }) {
  const db = getDB();
  const { start_ts, end_ts } = startEvent(guild, { name: 'Quest Burst', multiplier: 1.0, durationMin, channelId, startedBy });
  setBurstConfig(guild.id, 'quest_burst', { goals, winners, prizes, channel_id: channelId || null, start_ts, end_ts });
  db.prepare('DELETE FROM event_progress WHERE guild_id = ?').run(guild.id);
  return { start_ts, end_ts };
}

export function isBurstActive(guildId) {
  const active = getActiveEvent(guildId);
  if (!active) return false;
  const cfg = getBurstConfig(guildId);
  return !!cfg;
}

export function incBurstMetric(guildId, userId, metric, amount = 1) {
  if (!isBurstActive(guildId)) return;
  const db = getDB();
  const cfg = getBurstConfig(guildId) || {};
  const goals = Array.isArray(cfg.goals) ? cfg.goals : [];
  if (!goals.some(g => g.metric === metric)) return;

  db.prepare(`
    INSERT INTO event_progress (guild_id, user_id, metric, value)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id, metric) DO UPDATE SET value = value + excluded.value
  `).run(guildId, userId, metric, Math.max(1, Math.floor(amount)));

  let allMet = true;
  for (const g of goals) {
    const row = db.prepare('SELECT value FROM event_progress WHERE guild_id = ? AND user_id = ? AND metric = ?').get(guildId, userId, g.metric) || { value: 0 };
    if ((row.value || 0) < (g.target || 1)) { allMet = false; break; }
  }

  if (allMet) {
    const key = '__done__';
    const existing = db.prepare('SELECT completed_ts FROM event_progress WHERE guild_id = ? AND user_id = ? AND metric = ?').get(guildId, userId, key);
    if (!existing?.completed_ts) {
      db.prepare(`
        INSERT INTO event_progress (guild_id, user_id, metric, value, completed_ts)
        VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(guild_id, user_id, metric) DO UPDATE SET completed_ts=excluded.completed_ts
      `).run(guildId, userId, key, Date.now());
    }
  }
}

export function startEvent(guild, { name, multiplier, durationMin, channelId, startedBy }) {
  const db = getDB();
  const now = Date.now();
  const end = now + Math.max(5, Math.min(durationMin, 180)) * 60 * 1000;
  db.prepare(`
    INSERT INTO events_active (guild_id, event_name, multiplier, started_by, channel_id, start_ts, end_ts)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      event_name=excluded.event_name,
      multiplier=excluded.multiplier,
      started_by=excluded.started_by,
      channel_id=excluded.channel_id,
      start_ts=excluded.start_ts,
      end_ts=excluded.end_ts
  `).run(guild.id, name, multiplier, startedBy, channelId || null, now, end);

  scheduleEndTimer(guild.client, guild.id);
  return { start_ts: now, end_ts: end };
}

export function endEvent(guild, { announce = true } = {}) {
  const db = getDB();
  const row = getActiveEvent(guild.id);
  db.prepare(`DELETE FROM events_active WHERE guild_id = ?`).run(guild.id);
  const t = timers.get(guild.id);
  if (t) { clearTimeout(t); timers.delete(guild.id); }

  if (announce && row) {
    const meta = getBurstConfig(guild.id);
    if (meta && row.event_name === 'Quest Burst') {
      const goals = Array.isArray(meta.goals) ? meta.goals : [];
      const winners = Math.max(1, Math.min(5, Number(meta.winners || 3)));
      const done = db.prepare(`
        SELECT user_id, completed_ts FROM event_progress
        WHERE guild_id = ? AND metric = '__done__' AND completed_ts IS NOT NULL
        ORDER BY completed_ts ASC
        LIMIT ?
      `).all(guild.id, winners);
      const lines = [];

      for (let i = 0; i < done.length; i++) {
        const uid = done[i].user_id;
        const coins = Number((meta.prizes?.coins || [])[i] || 0);
        const xp = Number((meta.prizes?.xp || [])[i] || 0);
        try { if (coins) incWallet(uid, coins, 'event_prize'); } catch {}
        try { if (xp) addXp(guild.id, uid, xp); } catch {}
        lines.push(`**${i+1}.** <@${uid}> — prize: **${coins}** coins${xp?` + **${xp}** XP`:''}`);
      }

      if (!lines.length) {
        const users = db.prepare('SELECT DISTINCT user_id FROM event_progress WHERE guild_id = ? AND metric != "__done__"').all(guild.id);
        const scores = [];
        for (const u of users) {
          let sum = 0;
          for (const g of goals) {
            const v = db.prepare('SELECT value FROM event_progress WHERE guild_id = ? AND user_id = ? AND metric = ?').get(guild.id, u.user_id, g.metric) || { value: 0 };
            sum += Math.min(1, (v.value || 0) / Math.max(1, g.target || 1));
          }
          scores.push({ user_id: u.user_id, score: sum });
        }
        scores.sort((a,b)=> b.score - a.score);
        const top = scores.slice(0, winners);
        for (let i=0;i<top.length;i++){
          const coins = Number((meta.prizes?.coins || [])[i] || 0);
          const xp = Number((meta.prizes?.xp || [])[i] || 0);
          try { if (coins) incWallet(top[i].user_id, coins, 'event_prize'); } catch {}
          try { if (xp) addXp(guild.id, top[i].user_id, xp); } catch {}
          lines.push(`**${i+1}.** <@${top[i].user_id}> — prize: **${coins}** coins${xp?` + **${xp}** XP`:''}`);
        }
      }

      const ch = row.channel_id ? guild.channels.cache.get(row.channel_id) : null;
      const embed = new EmbedBuilder()
        .setTitle(`🏁 ${row.event_name} ended`)
        .setDescription(lines.length ? lines.join('\n') : 'Thanks for playing!')
        .setTimestamp(Date.now());
      if (ch?.isTextBased?.()) ch.send({ embeds: [embed] }).catch(()=>{});
      db.prepare('DELETE FROM events_meta WHERE guild_id = ?').run(guild.id);
      db.prepare('DELETE FROM event_progress WHERE guild_id = ?').run(guild.id);
    } else {
      const ch = row.channel_id ? guild.channels.cache.get(row.channel_id) : null;
      const embed = new EmbedBuilder()
        .setTitle(`🏁 ${row.event_name} ended`)
        .setDescription('Thanks for playing!')
        .setTimestamp(Date.now());
      if (ch?.isTextBased?.()) ch.send({ embeds: [embed] }).catch(()=>{});
    }
  }
}

export function recordEventScore(guildId, eventName, userId, score) {
  try {
    const db = getDB();
    db.prepare(`
      INSERT INTO event_results (guild_id, event_name, user_id, score, at_ts)
      VALUES (?, ?, ?, ?, ?)
    `).run(guildId, eventName, userId, Math.max(1, Math.floor(score)), Date.now());
  } catch (e) {
    console.error('recordEventScore error:', e);
  }
}

export function ensureEventScheduler(client) {
  const db = getDB();
  const now = Date.now();
  const rows = db.prepare(`SELECT * FROM events_active`).all();
  for (const row of rows) {
    if (row.end_ts <= now) {
      db.prepare(`DELETE FROM events_active WHERE guild_id = ?`).run(row.guild_id);
      continue;
    }
    scheduleEndTimer(client, row.guild_id);
  }
}

function scheduleEndTimer(client, guildId) {
  const db = getDB();
  const row = db.prepare(`SELECT * FROM events_active WHERE guild_id = ?`).get(guildId);
  if (!row) return;
  const ms = Math.max(0, row.end_ts - Date.now());
  const old = timers.get(guildId);
  if (old) clearTimeout(old);
  const t = setTimeout(async () => {
    const guild = await client.guilds.fetch(guildId).catch(()=>null);
    if (!guild) return;
    endEvent(guild, { announce: true });
  }, ms);
  timers.set(guildId, t);
}

export function recordChatActivity(guildId, userId) {
  if (!guildId || !userId) return;
  let m = activity.get(guildId);
  if (!m) { m = new Map(); activity.set(guildId, m); }
  m.set(userId, Date.now());
}

export function setupAutoEventScheduler(client) {
  const enabled = String(process.env.AUTO_EVENTS_ENABLED || 'false').toLowerCase() === 'true';
  if (!enabled) return;
  const lookbackSec = Number(process.env.AUTO_EVENTS_LOOKBACK_SEC || 180);
  const minActive = Number(process.env.AUTO_EVENTS_MIN_ACTIVE_USERS || 3);
  const cooldownMin = Number(process.env.AUTO_EVENTS_COOLDOWN_MIN || 180);
  const typeList = String(process.env.AUTO_EVENTS_TYPES || 'quest_burst,xp_boost').split(',').map(s=>s.trim()).filter(Boolean);
  const minutesList = String(process.env.AUTO_EVENTS_MINUTES || '15,30').split(',').map(s=>Number(s.trim())).filter(n=>!isNaN(n) && n>=5 && n<=180);

  setInterval(async () => {
    try {
      const now = Date.now();
      for (const [guildId, users] of activity.entries()){
        let activeCount = 0;
        for (const [uid, ts] of users.entries()){
          if (now - ts <= lookbackSec*1000) activeCount++; else users.delete(uid);
        }
        if (activeCount < minActive) continue;
        const active = getActiveEvent(guildId);
        if (active) continue;
        const st = autoState.get(guildId) || { lastStart: 0, lastEnd: 0 };
        const sinceLast = (now - Math.max(st.lastEnd, st.lastStart)) / (60*1000);
        if (sinceLast < cooldownMin) continue;

        const type = typeList[Math.floor(Math.random()*typeList.length)] || 'quest_burst';
        const duration = minutesList[Math.floor(Math.random()*minutesList.length)] || 30;

        const guild = await client.guilds.fetch(guildId).catch(()=>null);
        if (!guild) continue;
        const announceId = process.env.EVENTS_ANNOUNCE_CHANNEL_ID || null;
        if (type === 'quest_burst'){
          const presets = [['msgs',25],['works',2]];
          const goals = presets.map(([metric,target])=>({ metric, target }));
          startBurstEvent(guild, {
            durationMin: duration,
            channelId: announceId,
            startedBy: 'auto',
            goals,
            winners: 3,
            prizes: { coins: [800, 500, 300], xp: [0, 0, 0] }
          });
        } else {
          const mult = 1.2 + Math.random()*0.6;
          startEvent(guild, { name: 'XP Boost', multiplier: Number(mult.toFixed(2)), durationMin: duration, channelId: announceId, startedBy: 'auto' });
        }
        autoState.set(guildId, { lastStart: now, lastEnd: now });
      }
    } catch (e) {
      console.error('autoEvent scheduler error:', e);
    }
  }, 30 * 1000);
}

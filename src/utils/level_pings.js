// src/utils/level_pings.js
import { getDB } from '../lib/db.js';
import { ChannelType } from 'discord.js';

const lastPing = new Map(); // `${guildId}:${userId}` -> ts

function getGuildSettings(db, guildId){
  return db.prepare(
    'SELECT levelups_channel_id, clips_channel_id, throttle_sec FROM level_guild_settings WHERE guild_id = ?'
  ).get(guildId) || { levelups_channel_id: null, clips_channel_id: null, throttle_sec: 30 };
}
function getUserPref(db, guildId, userId){
  return db.prepare(
    'SELECT mode FROM level_user_prefs WHERE guild_id = ? AND user_id = ?'
  ).get(guildId, userId) || { mode: 'on' };
}

function resolveLevelupsChannel(guild, levelupsId){
  if (levelupsId) {
    const ch = guild.channels.cache.get(levelupsId);
    if (ch && ch.isTextBased?.() && ch.type !== ChannelType.GuildCategory) return ch;
  }
  const found = guild.channels.cache.find(c =>
    c?.isTextBased?.() &&
    (c.name?.toLowerCase() === 'level-ups' || c.name?.toLowerCase() === 'levelups')
  );
  return found || null;
}

async function pickRandomClipUrl(guild, clipsId){
  try {
    if (!clipsId) return null;
    const ch = guild.channels.cache.get(clipsId);
    if (!ch?.isTextBased?.()) return null;
    const msgs = await ch.messages.fetch({ limit: 50 });
    const pool = [];
    for (const m of msgs.values()){
      for (const att of m.attachments.values()){
        const u = (att.url || '').toLowerCase();
        if (u.endsWith('.mp4') || u.endsWith('.mov') || u.endsWith('.webm')) pool.push(att.url);
      }
      pool.push(`https://discord.com/channels/${guild.id}/${ch.id}/${m.id}`);
    }
    if (!pool.length) return null;
    return pool[Math.floor(Math.random()*pool.length)];
  } catch {
    return null;
  }
}

function fmt(level, userMention){
  return `🎉 ${userMention} hit **Level ${level}**!`;
}

export async function handleLevelUpPing(message, newLevel){
  try {
    const guild = message.guild;
    if (!guild) return;

    const db = getDB();
    const gs = getGuildSettings(db, guild.id);
    const pref = getUserPref(db, guild.id, message.author.id);

    const key = `${guild.id}:${message.author.id}`;
    const now = Date.now();
    const wait = (gs.throttle_sec || 30) * 1000;
    if (now - (lastPing.get(key) || 0) < wait) return;
    lastPing.set(key, now);

    const mode = pref.mode || 'on';
    if (mode === 'off') return;

    const content = fmt(newLevel, `<@${message.author.id}>`);

    if (mode === 'dm'){
      const clipUrl = await pickRandomClipUrl(guild, gs.clips_channel_id);
      try {
        await message.author.send({ content: clipUrl ? `${content}\n${clipUrl}` : content });
        return;
      } catch { /* fallback below */ }
    }

    if (mode === 'announce'){
      await message.channel.send({ content });
      return;
    }

    const levelups = resolveLevelupsChannel(guild, gs.levelups_channel_id);
    if (levelups) {
      try { await levelups.send({ content }); return; } catch {}
    }
    try { await message.channel.send({ content }); return; } catch {}
    try { await message.author.send({ content }); } catch {}
  } catch (e){
    console.error('level-up ping error:', e);
  }
}

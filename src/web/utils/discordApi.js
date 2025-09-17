import { BOT_TOKEN } from './config.js';

const API_BASE = 'https://discord.com/api/v10';

function requireToken() {
  if (!BOT_TOKEN) {
    throw new Error('BOT_TOKEN missing; cannot query Discord API');
  }
}

async function discordFetch(endpoint) {
  requireToken();
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord API ${res.status}: ${text}`);
  }
  return res.json();
}

export async function fetchGuildMeta(guildId) {
  if (!BOT_TOKEN) return null;
  return discordFetch(`/guilds/${guildId}?with_counts=true`);
}

export async function fetchGuildChannels(guildId) {
  if (!BOT_TOKEN) return [];
  return discordFetch(`/guilds/${guildId}/channels`);
}

export async function fetchGuildRoles(guildId) {
  if (!BOT_TOKEN) return [];
  return discordFetch(`/guilds/${guildId}/roles`);
}

export async function measureApiLatency() {
  if (!BOT_TOKEN) return null;
  const start = Date.now();
  await discordFetch('/gateway');
  return Date.now() - start;
}

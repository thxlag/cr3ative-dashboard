import tmi from 'tmi.js';
import { LiveChat } from 'youtube-chat';

const POLL_MS = Number(process.env.STREAM_POLL_MS || 60_000);

let twitchClient = null;
let youtubeChat = null;
let youtubeLiveId = null;
let twitchAppToken = null;
let polling = false;

const chatListeners = new Set(); // callbacks: (platform, meta) => {}

export function onStreamChat(cb){
  chatListeners.add(cb);
  return () => chatListeners.delete(cb);
}

function emitChat(platform, meta){
  for (const cb of chatListeners) {
    try { cb(platform, meta); } catch (e) { console.error('stream chat listener error', e); }
  }
}

// Helper: get twitch app token (app access) — for live check only
async function ensureTwitchAppToken(){
  const id = process.env.TWITCH_CLIENT_ID, secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (twitchAppToken && twitchAppToken.expiresAt > Date.now()) return twitchAppToken.token;
  try {
    const url = `https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`;
    const res = await fetch(url, { method: 'POST' });
    const j = await res.json();
    if (j.access_token) {
      twitchAppToken = { token: j.access_token, expiresAt: Date.now() + ((j.expires_in||3600)-60)*1000 };
      return twitchAppToken.token;
    }
  } catch (e){ console.warn('twitch token fetch failed', e); }
  return null;
}

// Check if Twitch channel is live; returns { live:boolean, streamId?, userLogin? }
async function checkTwitchLive(){
  const channel = process.env.TWITCH_CHANNEL;
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!channel || !clientId) return { live: false };
  const appToken = await ensureTwitchAppToken();
  if (!appToken) return { live: false };
  try {
    const url = `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channel)}`;
    const res = await fetch(url, { headers: { 'Client-ID': clientId, 'Authorization': `Bearer ${appToken}` } });
    const j = await res.json();
    if (j?.data && j.data.length) {
      const s = j.data[0];
      return { live: true, streamId: s.id, userLogin: s.user_login };
    }
  } catch (e){ console.warn('twitch live check failed', e); }
  return { live: false };
}

// Check YouTube live: search for active live broadcast; returns { live:boolean, liveId? }
async function checkYouTubeLive(){
  const key = process.env.YT_API_KEY;
  const channelId = process.env.YT_CHANNEL_ID;
  if (!key || !channelId) return { live: false };
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${key}`;
    const res = await fetch(url);
    const j = await res.json();
    if (j?.items && j.items.length){
      return { live: true, liveId: j.items[0].id.videoId };
    }
  } catch (e){ console.warn('youtube live check failed', e); }
  return { live: false };
}

// Connect Twitch chat via tmi.js and forward messages
function connectTwitch(){
  if (twitchClient) return;
  const botUser = process.env.TWITCH_BOT_USERNAME;
  const oauth = process.env.TWITCH_BOT_OAUTH;
  const channel = process.env.TWITCH_CHANNEL;
  if (!botUser || !oauth || !channel) {
    console.warn('Twitch bot credentials missing; skipping connect.');
    return;
  }
  twitchClient = new tmi.Client({
    options: { debug: false },
    identity: { username: botUser, password: oauth },
    channels: [ channel ]
  });
  twitchClient.connect().catch(e=>console.warn('tmi connect failed', e));
  twitchClient.on('message', (channelName, tags, message, self) => {
    if (self) return;
    const meta = {
      platformUserId: tags['user-id'] || tags['id'],
      username: tags['display-name'] || tags.username,
      message,
      platformRaw: { channelName, tags }
    };
    emitChat('twitch', meta);
  });
  console.log('Twitch chat connected.');
}
function disconnectTwitch(){
  if (!twitchClient) return;
  try { twitchClient.disconnect(); } catch {}
  twitchClient = null;
  console.log('Twitch chat disconnected.');
}

// Connect YouTube live chat via youtube-chat
async function connectYouTube(liveId){
  if (youtubeChat) return;
  if (!liveId) { console.warn('No YouTube liveId; skipping connect.'); return; }
  youtubeChat = new LiveChat({ liveId });
  youtubeChat.on('chat', (chatItem) => {
    emitChat('youtube', {
      platformUserId: chatItem.author?.channelId,
      username: chatItem.author?.name,
      message: chatItem.message,
      platformRaw: chatItem
    });
  });
  try { await youtubeChat.start(); console.log('YouTube chat connected.'); } catch (e){ console.warn('youtube start failed', e); youtubeChat = null; }
}
async function disconnectYouTube(){
  if (!youtubeChat) return;
  try { await youtubeChat.stop(); } catch {}
  youtubeChat = null;
  console.log('YouTube chat disconnected.');
}

// Fetch YouTube live video info by liveId
export async function getYouTubeLiveInfo(liveId) {
  const key = process.env.YT_API_KEY;
  if (!key || !liveId) return null;
  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails,statistics&id=${liveId}&key=${key}`;
    const res = await fetch(url);
    const j = await res.json();
    if (j?.items && j.items.length) {
      return j.items[0]; // Contains snippet, liveStreamingDetails, statistics, etc.
    }
  } catch (e) {
    console.warn('youtube live info fetch failed', e);
  }
  return null;
}

// Send a message as the bot in Twitch chat
export function sendTwitchMessage(message) {
  const channel = process.env.TWITCH_CHANNEL;
  if (twitchClient && channel) {
    twitchClient.say(channel, message).catch(e => console.warn('Twitch send failed', e));
  }
}

// Main polling loop
function startStreamManager(){
  if (polling) return;
  polling = true;

  async function tick(){
    try {
      const t = await checkTwitchLive();
      if (t.live) { if (!twitchClient) connectTwitch(); } else { if (twitchClient) disconnectTwitch(); }
      const y = await checkYouTubeLive();
      if (y.live) {
        if (!youtubeChat || youtubeLiveId !== y.liveId) {
          youtubeLiveId = y.liveId;
          await connectYouTube(y.liveId);
        }
      } else {
        if (youtubeChat) await disconnectYouTube();
        youtubeLiveId = null;
      }
    } catch (e){
      console.error('stream manager tick failed', e);
    }
    setTimeout(tick, POLL_MS);
  }

  tick();
}

// Export as ES module
export { startStreamManager };

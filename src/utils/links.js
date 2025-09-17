import { getDB } from '../lib/db.js';
import crypto from 'node:crypto';

function ensureLinks(db){
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS social_links (
        discord_user_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        platform_user_id TEXT,
        handle TEXT,
        verified INTEGER NOT NULL DEFAULT 0,
        proof_code TEXT,
        last_checked INTEGER,
        PRIMARY KEY (discord_user_id, platform)
      );
    `);
  } catch {}
}

export function getLink(discordId, platform){
  const db = getDB(); ensureLinks(db);
  return db.prepare('SELECT * FROM social_links WHERE discord_user_id = ? AND platform = ?').get(discordId, platform) || null;
}

export function setLink({ discordId, platform, platformUserId=null, handle=null, verified=0, proofCode=null }){
  const db = getDB(); ensureLinks(db);
  const existing = getLink(discordId, platform);
  if (existing){
    db.prepare('UPDATE social_links SET platform_user_id=?, handle=?, verified=?, proof_code=?, last_checked=? WHERE discord_user_id=? AND platform=?')
      .run(platformUserId, handle, verified?1:0, proofCode, Date.now(), discordId, platform);
  } else {
    db.prepare('INSERT INTO social_links (discord_user_id, platform, platform_user_id, handle, verified, proof_code, last_checked) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(discordId, platform, platformUserId, handle, verified?1:0, proofCode, Date.now());
  }
}

export function newProofCode(){ return crypto.randomBytes(4).toString('hex'); }

export function listVerifiedByPlatform(platform){
  const db = getDB(); ensureLinks(db);
  return db.prepare('SELECT discord_user_id, platform_user_id, handle FROM social_links WHERE platform = ? AND verified = 1').all(platform);
}


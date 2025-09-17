import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db;

function resolveDbPath() {
  return process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, '..', '..', 'data', 'economy.sqlite');
}

function initializeDB() {
  if (db) {
    return db;
  }

  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = wal');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      wallet INTEGER NOT NULL DEFAULT 0,
      bank INTEGER NOT NULL DEFAULT 0,
      last_daily INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS txns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL,
      reason TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analytics_message_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT,
      user_id TEXT NOT NULL,
      message_id TEXT,
      created_at INTEGER NOT NULL,
      word_count INTEGER NOT NULL DEFAULT 0,
      is_reply INTEGER NOT NULL DEFAULT 0,
      reply_count INTEGER NOT NULL DEFAULT 0,
      mention_count INTEGER NOT NULL DEFAULT 0,
      sentiment REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_ama_guild_time ON analytics_message_activity(guild_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_ama_channel_time ON analytics_message_activity(channel_id, created_at);
    CREATE TABLE IF NOT EXISTS analytics_command_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      channel_id TEXT,
      user_id TEXT NOT NULL,
      command_name TEXT NOT NULL,
      success INTEGER NOT NULL DEFAULT 1,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      used_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_acu_guild_time ON analytics_command_usage(guild_id, used_at);
    CREATE INDEX IF NOT EXISTS idx_acu_user ON analytics_command_usage(guild_id, user_id);
    CREATE TABLE IF NOT EXISTS analytics_member_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_at INTEGER NOT NULL,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ame_guild_time ON analytics_member_events(guild_id, event_at);
    CREATE TABLE IF NOT EXISTS analytics_command_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      user_id TEXT,
      command_name TEXT,
      error_message TEXT,
      stack TEXT,
      occurred_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ace_guild_time ON analytics_command_errors(guild_id, occurred_at);
  `);

  return db;
}

export function getDB() {
  if (!db) {
    initializeDB();
  }
  return db;
}

export async function ensureDB() {
  return initializeDB();
}

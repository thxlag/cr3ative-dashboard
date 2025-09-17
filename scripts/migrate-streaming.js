// Migration script for stream integration features

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// ES module equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine DB path from env or use default
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'economy.sqlite');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Connect to the database
const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

console.log('Running streaming integration database migrations...');

// Create user_links table for account linking
db.exec(`
  CREATE TABLE IF NOT EXISTS user_links (
    discord_id TEXT PRIMARY KEY,
    twitch_username TEXT,
    youtube_username TEXT,
    linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create stream_clips table
db.exec(`
  CREATE TABLE IF NOT EXISTS stream_clips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    clip_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    url TEXT NOT NULL,
    title TEXT,
    view_count INTEGER DEFAULT 0
  )
`);

// Create stream_events table
db.exec(`
  CREATE TABLE IF NOT EXISTS stream_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create stream_stats table
db.exec(`
  CREATE TABLE IF NOT EXISTS stream_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    stream_id TEXT NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    peak_viewers INTEGER DEFAULT 0,
    average_viewers INTEGER DEFAULT 0,
    follower_gain INTEGER DEFAULT 0,
    subscriber_gain INTEGER DEFAULT 0,
    chat_messages INTEGER DEFAULT 0
  )
`);

// Create stream_milestones table
db.exec(`
  CREATE TABLE IF NOT EXISTS stream_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    milestone_type TEXT NOT NULL,
    milestone_value INTEGER NOT NULL,
    reached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    announced BOOLEAN DEFAULT 0
  )
`);

// Create trigger to update the updated_at timestamp
db.exec(`
  CREATE TRIGGER IF NOT EXISTS update_user_links_timestamp
  AFTER UPDATE ON user_links
  BEGIN
    UPDATE user_links SET updated_at = CURRENT_TIMESTAMP WHERE discord_id = NEW.discord_id;
  END
`);

console.log('Database migrations completed successfully!');
console.log('You can now use the stream integration features.');
console.log('Make sure the following environment variables are set in your .env file:');
console.log('- STREAM_NOTIFICATION_CHANNEL_ID: Channel where stream notifications are posted');
console.log('- STREAM_ROLE_ID: Role to ping when going live');
console.log('- TWITCH_SUB_ROLE_ID: Role for Twitch subscribers (optional)');
console.log('- YOUTUBE_MEMBER_ROLE_ID: Role for YouTube members (optional)');
console.log('- STREAM_THUMBNAIL_UPDATE_INTERVAL: How often to update stream thumbnails in minutes');
console.log('- MILESTONE_ANNOUNCEMENTS_ENABLED: Set to "true" to enable milestone celebrations');

// Close the database
db.close();

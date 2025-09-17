import { getDB } from "../lib/db.js";

const db = getDB();

const insertMessageStmt = db.prepare(`
  INSERT INTO analytics_message_activity (
    guild_id,
    channel_id,
    channel_name,
    user_id,
    message_id,
    created_at,
    word_count,
    is_reply,
    reply_count,
    mention_count,
    sentiment
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertCommandUsageStmt = db.prepare(`
  INSERT INTO analytics_command_usage (
    guild_id,
    channel_id,
    user_id,
    command_name,
    success,
    duration_ms,
    used_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertMemberEventStmt = db.prepare(`
  INSERT INTO analytics_member_events (
    guild_id,
    user_id,
    event_type,
    event_at,
    metadata
  ) VALUES (?, ?, ?, ?, ?)
`);

const insertCommandErrorStmt = db.prepare(`
  INSERT INTO analytics_command_errors (
    guild_id,
    user_id,
    command_name,
    error_message,
    stack,
    occurred_at
  ) VALUES (?, ?, ?, ?, ?, ?)
`);

function safeRun(stmt, params) {
  try {
    stmt.run(...params);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("analytics tracker failed", error);
    }
  }
}

export function recordMessageActivity({
  guildId,
  channelId,
  channelName,
  userId,
  messageId,
  createdAt,
  wordCount,
  isReply,
  replyCount,
  mentionCount,
  sentiment,
}) {
  safeRun(insertMessageStmt, [
    guildId,
    channelId,
    channelName ?? null,
    userId,
    messageId ?? null,
    createdAt,
    wordCount ?? 0,
    isReply ? 1 : 0,
    replyCount ?? 0,
    mentionCount ?? 0,
    sentiment ?? 0,
  ]);
}

export function recordCommandUsage({
  guildId,
  channelId,
  userId,
  commandName,
  success,
  durationMs,
  usedAt,
}) {
  safeRun(insertCommandUsageStmt, [
    guildId ?? null,
    channelId ?? null,
    userId,
    commandName,
    success ? 1 : 0,
    Math.max(0, Math.floor(durationMs ?? 0)),
    usedAt,
  ]);
}

export function recordMemberEvent({ guildId, userId, eventType, eventAt, metadata }) {
  safeRun(insertMemberEventStmt, [
    guildId,
    userId,
    eventType,
    eventAt,
    metadata ?? null,
  ]);
}

export function recordCommandError({ guildId, userId, commandName, error, occurredAt }) {
  const message = error?.message ? String(error.message).slice(0, 500) : null;
  const stack = error?.stack ? String(error.stack).slice(0, 2000) : null;
  safeRun(insertCommandErrorStmt, [
    guildId ?? null,
    userId ?? null,
    commandName ?? null,
    message,
    stack,
    occurredAt,
  ]);
}

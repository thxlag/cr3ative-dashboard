// src/utils/modlog.js
import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getDB } from '../lib/db.js';

export function getModlogChannelId(guildId) {
  const db = getDB();
  const row = db.prepare('SELECT channel_id FROM modlog_settings WHERE guild_id = ?').get(guildId);
  return row?.channel_id || null;
}

export function setModlogChannelId(guildId, channelId) {
  const db = getDB();
  db.prepare(`
    INSERT INTO modlog_settings (guild_id, channel_id)
    VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id
  `).run(guildId, channelId);
}

export function nextCaseId(guildId) {
  const db = getDB();
  const row = db.prepare('SELECT MAX(case_id) AS max FROM mod_cases WHERE guild_id = ?').get(guildId);
  return (row?.max || 0) + 1;
}

export function createCase(guild, { action, targetId, moderatorId, reason = '', extra = null }) {
  const db = getDB();
  const caseId = nextCaseId(guild.id);
  const createdAt = Date.now();
  const extra_json = extra ? JSON.stringify(extra) : null;

  db.prepare(`
    INSERT INTO mod_cases (guild_id, case_id, action, target_id, moderator_id, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(guild.id, caseId, action, targetId, moderatorId, reason, createdAt);

  return { guild_id: guild.id, case_id: caseId, action, target_id: targetId, moderator_id: moderatorId, reason, created_at: createdAt, extra_json };
}

export function getCase(guildId, caseId) {
  const db = getDB();
  return db.prepare('SELECT * FROM mod_cases WHERE guild_id = ? AND case_id = ?').get(guildId, caseId) || null;
}

export function updateCaseReason(guildId, caseId, reason) {
  const db = getDB();
  db.prepare('UPDATE mod_cases SET reason = ? WHERE guild_id = ? AND case_id = ?').run(reason, guildId, caseId);
}

export async function postCaseLog(guild, caseRow) {
  const channelId = getModlogChannelId(guild.id);
  if (!channelId) return null;
  const ch = guild.channels.cache.get(channelId);
  if (!ch?.isTextBased?.()) return null;

  const embed = buildCaseEmbed(caseRow);
  try {
    const msg = await ch.send({ embeds: [embed] });
    const db = getDB();
    db.prepare('UPDATE mod_cases SET log_channel_id = ?, log_message_id = ? WHERE guild_id = ? AND case_id = ?')
      .run(channelId, msg.id, caseRow.guild_id, caseRow.case_id);
    return msg;
  } catch {
    return null;
  }
}

export async function editCaseLogMessage(guild, caseRow) {
  if (!caseRow?.log_channel_id || !caseRow?.log_message_id) return false;
  const ch = guild.channels.cache.get(caseRow.log_channel_id);
  if (!ch?.isTextBased?.()) return false;
  try {
    await ch.messages.edit(caseRow.log_message_id, { embeds: [buildCaseEmbed(caseRow)] });
    return true;
  } catch {
    return false;
  }
}

export function buildCaseEmbed(row) {
  const actionFmt = formatAction(row.action);
  const color = actionColor(row.action);
  const embed = new EmbedBuilder()
    .setTitle(`Case #${row.case_id} • ${actionFmt}`)
    .setColor(color)
    .addFields(
      { name: 'Member', value: `<@${row.target_id}> (${row.target_id})`, inline: false },
      { name: 'Moderator', value: `<@${row.moderator_id}> (${row.moderator_id})`, inline: false },
      { name: 'Reason', value: row.reason?.trim() ? row.reason : 'No reason provided', inline: false },
    )
    .setTimestamp(row.created_at);
  return embed;
}

function formatAction(a) {
  switch (a) {
    case 'ban': return 'Ban';
    case 'kick': return 'Kick';
    case 'timeout': return 'Timeout';
    default: return a;
  }
}

function actionColor(a) {
  switch (a) {
    case 'ban': return 0xed4245;      // red
    case 'kick': return 0xfaa61a;     // orange
    case 'timeout': return 0xfee75c;  // yellow
    default: return 0x5865f2;         // blurple
  }
}


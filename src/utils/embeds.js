// src/utils/embeds.js
import { EmbedBuilder } from 'discord.js';

export const COLORS = {
  info: 0x5865f2,     // blurple
  success: 0x57f287,  // green
  warn: 0xfee75c,     // yellow
  error: 0xed4245,    // red
  neutral: 0x2b2d31,  // dark gray
};

export function baseEmbed({ title, description = null, color = 'neutral' } = {}) {
  const c = typeof color === 'number' ? color : (COLORS[color] ?? COLORS.neutral);
  const footerText = process.env.BOT_NAME || 'Cr3ative BOT v5.02';
  const e = new EmbedBuilder().setColor(c).setTimestamp(Date.now());
  if (title) e.setTitle(title);
  if (description) e.setDescription(description);
  e.setFooter({ text: footerText });
  return e;
}


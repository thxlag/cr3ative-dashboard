// src/utils/achievements_feed.js
import { EmbedBuilder } from 'discord.js';
import { ACHIEVEMENTS } from './achievements.js';

export async function postAchievement(guild, userId, key){
  try {
    const channelId = process.env.ACHIEVEMENTS_CHANNEL_ID?.trim();
    if (!channelId) return false;
    const ch = guild.channels.cache.get(channelId);
    if (!ch?.isTextBased?.()) return false;
    const meta = ACHIEVEMENTS[key];
    if (!meta) return false;
    const embed = new EmbedBuilder()
      .setTitle(`🏆 Achievement Unlocked: ${meta.name}`)
      .setDescription(meta.desc)
      .addFields({ name: 'Reward', value: `${meta.reward_coins || 0} coins` })
      .setFooter({ text: guild.name })
      .setTimestamp(Date.now());
    await ch.send({ content: `<@${userId}>`, embeds: [embed] });
    return true;
  } catch {
    return false;
  }
}


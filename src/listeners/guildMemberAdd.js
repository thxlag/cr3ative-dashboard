import { EmbedBuilder } from 'discord.js';
import { recordMemberEvent } from '../analytics/tracker.js';

export async function onGuildMemberAdd(member) {
  try {
    const guild = member.guild;
    const chId = process.env.WELCOME_CHANNEL_ID || guild.systemChannelId || null;
    const channel = chId ? guild.channels.cache.get(chId) : null;
    if (!channel?.isTextBased?.()) return;

    const rules = process.env.RULES_CHANNEL_ID ? `<#${process.env.RULES_CHANNEL_ID}>` : 'the rules';
    const getStarted = process.env.GET_STARTED_TEXT || 'Say hi, use /help to explore commands, and try /daily to get started!';

    const e = new EmbedBuilder()
      .setTitle('dY`< Welcome!')
      .setDescription([
        `Welcome to **${guild.name}**, ${member}!`,
        `Check ${rules}, then try /help.`,
        getStarted,
      ].join('\n'))
      .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
      .setTimestamp(Date.now());

    await channel.send({ content: `${member}`, embeds: [e] });

    try {
      recordMemberEvent({
        guildId: guild.id,
        userId: member.id,
        eventType: 'join',
        eventAt: Date.now(),
        metadata: JSON.stringify({ accountCreatedAt: member.user?.createdTimestamp ?? null }),
      });
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('member join analytics failed', error);
      }
    }
  } catch (e) {
    // swallow errors; welcome is best-effort
  }
}

import { recordMemberEvent } from '../analytics/tracker.js';
import { EmbedBuilder } from 'discord.js';

export default {
  name: 'guildMemberAdd',
  async execute(member, client) {
    console.log('guildMemberAdd event triggered');
    try {
      // Record analytics
      try {
        await recordMemberEvent(member, 'join');
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('member join analytics failed', error);
        }
      }

      const lines = [
        `Welcome, <@${member.id}>, to **${member.guild.name}**!`,
        `You are member #${member.guild.memberCount}`,
        '',
        'Please read the rules and enjoy your stay!'
      ].join('\n');

      // Send welcome message to a specific channel
      const channel = member.guild.systemChannel || member.guild.channels.cache.find(ch => ch.name === 'general');
      if (channel) {
        console.log('Sending welcome message');
        const e = new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle('New Member!')
          .setDescription(lines)
          .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
          .setTimestamp(Date.now());

        await channel.send({ content: `${member}`, embeds: [e] });
      }
    } catch (error) {
      console.error('Error handling member join:', error);
    }
  }
};
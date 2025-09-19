import { recordMemberEvent } from '../analytics/tracker.js';

export default {
  name: 'guildMemberAdd',
  async execute(member, client) {
    console.log('guildMemberAdd event triggered'); // Add this line
    try {
      // Record analytics
      // You can uncomment this when tracker.js is working
      /*
      const { recordMemberEvent } = await import('../analytics/tracker.js');
      await recordMemberEvent(member, 'join');
      */
      
      const lines = [
        `Welcome, <@${member.id}>, to **${member.guild.name}**!`,
        `You are member #${member.guild.memberCount}.`,
        '',
        'Please read the rules and enjoy your stay!'
      ].join('\n');

      // Send welcome message to a specific channel
      const channel = member.guild.systemChannel || member.guild.channels.cache.find(ch => ch.name === 'general');
      if (channel) {
        console.log('Sending welcome message'); // Add this line
        const e = new client.discord.MessageEmbed()
          .setColor('#0099ff')
          .setTitle('New Member!')
          .setDescription(lines)
          .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
          .setTimestamp(Date.now());

        await channel.send({ content: `${member}`, embeds: [e] });

        try {
          // Record for analytics
          await recordMemberEvent(member, 'join');
        } catch (error) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('member join analytics failed', error);
          }
        }
      }
    } catch (error) {
      console.error('Error handling member join:', error);
    }
  }
};

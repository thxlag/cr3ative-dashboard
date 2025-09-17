import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('AboutBot');

export default {
  data: new SlashCommandBuilder()
    .setName('aboutbot')
    .setDescription('Display information about the bot'),

  async execute(interaction, client, db) {
    const uptimeSeconds = Math.floor(process.uptime());
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    
    const uptime = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    const guildCount = client.guilds.cache.size;
    const userCount = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
    const commandCount = client.commands.size;
    
    const botName = process.env.BOT_NAME || client.user.username;
    const supportUrl = process.env.SUPPORT_URL || 'https://discord.gg/support';
    const subscribeUrl = process.env.SUBSCRIBE_URL || 'https://youtube.com/@channel';
    
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(botName)
      .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
      .setDescription('A versatile Discord bot for economy, games, moderation, and streaming integration.')
      .addFields(
        { name: 'Version', value: 'v5.0.2', inline: true },
        { name: 'Uptime', value: uptime, inline: true },
        { name: 'Ping', value: `${client.ws.ping}ms`, inline: true },
        { name: 'Servers', value: guildCount.toString(), inline: true },
        { name: 'Users', value: userCount.toString(), inline: true },
        { name: 'Commands', value: commandCount.toString(), inline: true },
        { name: 'Created By', value: 'Thxlag', inline: true },
        { name: 'Built With', value: 'discord.js v14', inline: true },
        { name: 'Node.js', value: process.version, inline: true }
      )
      .setFooter({ text: 'Use /help to see available commands' })
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Support')
          .setURL(supportUrl)
          .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
          .setLabel('Subscribe')
          .setURL(subscribeUrl)
          .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
          .setCustomId('aboutbot_patchnotes')
          .setLabel('Patch Notes')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('aboutbot_feedback')
          .setLabel('Feedback')
          .setStyle(ButtonStyle.Success)
      );

    await interaction.reply({
      embeds: [embed],
      components: [row]
    });
  },

  async handleInteraction(interaction, client, db) {
    if (interaction.customId === 'aboutbot_patchnotes') {
      await showPatchNotes(interaction);
    } else if (interaction.customId === 'aboutbot_feedback') {
      await showFeedbackModal(interaction);
    }
  }
};

async function showPatchNotes(interaction) {
  const patchNotesEmbed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('Patch Notes - v5.0.2')
    .setDescription('Recent updates and changes to the bot')
    .addFields(
      { 
        name: 'New Streaming Features', 
        value: [
          '- Added Twitch and YouTube stream integration',
          '- Live notifications with auto-updating thumbnails and viewer counts',
          '- Stream milestone celebrations for follower/subscriber goals',
          '- Create Twitch clips directly from Discord',
          '- Twitch subscriber and YouTube member role syncing',
          '- `/stream status|clip|link` commands to interact with streams',
          '- `/streamrole join|leave` commands to manage notifications'
        ].join('\n'),
        inline: false 
      },
      { 
        name: 'Job System Enhancements', 
        value: [
          '- Promotions for regular workers',
          '- Special shift events with bonuses',
          '- Item synergy with shop items',
          '- Better job progression'
        ].join('\n'),
        inline: false 
      },
      { 
        name: 'Bug Fixes & Improvements', 
        value: [
          '- Fixed leaderboard pagination',
          '- Improved economy command performance',
          '- Better error handling for all commands',
          '- Updated help command with all features'
        ].join('\n'),
        inline: false 
      }
    )
    .setFooter({ text: 'Bot Version 5.0.2' })
    .setTimestamp();

  await interaction.reply({
    embeds: [patchNotesEmbed],
    ephemeral: true
  });
}

async function showFeedbackModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('feedback_modal')
    .setTitle('Bot Feedback');

  const feedbackInput = new TextInputBuilder()
    .setCustomId('feedback_input')
    .setLabel('What would you like to tell us?')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Enter your feedback, bug report, or suggestion here...')
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(1000);

  const actionRow = new ActionRowBuilder().addComponents(feedbackInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);
}

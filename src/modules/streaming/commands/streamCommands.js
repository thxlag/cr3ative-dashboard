import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { log } from '../../../utils/logger.js';

const commands = [
  new SlashCommandBuilder()
    .setName('stream')
    .setDescription('Stream-related commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check if the streamer is currently live'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('clip')
        .setDescription('Create a clip of the current stream'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('link')
        .setDescription('Link your Twitch/YouTube account to Discord')
        .addStringOption(option =>
          option
            .setName('platform')
            .setDescription('The platform to link')
            .setRequired(true)
            .addChoices(
              { name: 'Twitch', value: 'twitch' },
              { name: 'YouTube', value: 'youtube' }
            ))
        .addStringOption(option =>
          option
            .setName('username')
            .setDescription('Your username on the selected platform')
            .setRequired(true))),
  new SlashCommandBuilder()
    .setName('streamrole')
    .setDescription('Manage stream notification roles')
    .addSubcommand(subcommand =>
      subcommand
        .setName('join')
        .setDescription('Get notified when the stream goes live'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('leave')
        .setDescription('Stop receiving stream notifications'))
];

async function handleStreamStatus(interaction, streamHandler) {
  if (!streamHandler) {
    await interaction.reply({ content: 'Stream system not initialized yet.', ephemeral: true });
    return;
  }

  if (streamHandler.isLive) {
    const platform = streamHandler.currentPlatform;
    const streamTime = Math.floor((Date.now() - streamHandler.streamStartTime.getTime()) / 1000);
    const hours = Math.floor(streamTime / 3600);
    const minutes = Math.floor((streamTime % 3600) / 60);

    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('Stream Status')
      .setDescription(`**${streamHandler.twitchChannel || 'Streamer'}** is currently **LIVE** on ${platform}!`)
      .addFields(
        { name: 'Current Viewers', value: String(streamHandler.currentViewers || 0), inline: true },
        { name: 'Uptime', value: `${hours}h ${minutes}m`, inline: true },
        {
          name: 'Watch Now',
          value: platform === 'twitch'
            ? `[Watch on Twitch](https://twitch.tv/${streamHandler.twitchChannel})`
            : `[Watch on YouTube](https://youtube.com/channel/${streamHandler.youtubeChannelId}/live)`
        }
      )
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel(`Watch on ${platform === 'twitch' ? 'Twitch' : 'YouTube'}`)
          .setStyle(ButtonStyle.Link)
          .setURL(
            platform === 'twitch'
              ? `https://twitch.tv/${streamHandler.twitchChannel}`
              : `https://youtube.com/channel/${streamHandler.youtubeChannelId}/live`
          ),
        new ButtonBuilder()
          .setCustomId('clip_stream')
          .setLabel('Create Clip')
          .setStyle(ButtonStyle.Primary)
      );

    await interaction.reply({ embeds: [embed], components: [row] });
  } else {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('Stream Status')
      .setDescription(`**${streamHandler.twitchChannel || 'Streamer'}** is currently **OFFLINE**.`)
      .addFields(
        { name: 'Get Notified', value: 'Use `/streamrole join` to get notified when the stream goes live!' },
        {
          name: 'Channel Links',
          value: streamHandler.twitchChannel
            ? `[Twitch Channel](https://twitch.tv/${streamHandler.twitchChannel})`
            : `[YouTube Channel](https://youtube.com/channel/${streamHandler.youtubeChannelId})`
        }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
}

async function handleAccountLink(interaction, db) {
  const platform = interaction.options.getString('platform');
  const username = interaction.options.getString('username');
  const userId = interaction.user.id;

  try {
    const existingLink = await db.get('SELECT * FROM user_links WHERE discord_id = ?', [userId]);

    if (existingLink) {
      if (platform === 'twitch') {
        await db.run('UPDATE user_links SET twitch_username = ? WHERE discord_id = ?', [username, userId]);
      } else {
        await db.run('UPDATE user_links SET youtube_username = ? WHERE discord_id = ?', [username, userId]);
      }
    } else {
      if (platform === 'twitch') {
        await db.run('INSERT INTO user_links (discord_id, twitch_username) VALUES (?, ?)', [userId, username]);
      } else {
        await db.run('INSERT INTO user_links (discord_id, youtube_username) VALUES (?, ?)', [userId, username]);
      }
    }

    await interaction.reply({
      content: `Successfully linked your ${platform === 'twitch' ? 'Twitch' : 'YouTube'} account (${username}) to your Discord account!`,
      ephemeral: true
    });
  } catch (error) {
    log.error('Error linking account', error);
    await interaction.reply({
      content: 'An error occurred while linking your account. Please try again later.',
      ephemeral: true
    });
  }
}

async function handleJoinStreamRole(interaction) {
  const roleId = process.env.STREAM_ROLE_ID;
  if (!roleId) {
    await interaction.reply({ content: 'Stream notification role is not configured.', ephemeral: true });
    return;
  }

  try {
    const role = await interaction.guild.roles.fetch(roleId);
    if (!role) {
      await interaction.reply({ content: 'Stream notification role not found.', ephemeral: true });
      return;
    }

    const member = interaction.member;
    if (member.roles.cache.has(roleId)) {
      await interaction.reply({ content: 'You already have the stream notification role!', ephemeral: true });
      return;
    }

    await member.roles.add(role);
    await interaction.reply({ content: 'You will now be notified when the stream goes live!', ephemeral: true });
  } catch (error) {
    log.error('Error adding stream role', error);
    await interaction.reply({ content: 'An error occurred while adding the role. Please try again later.', ephemeral: true });
  }
}

async function handleLeaveStreamRole(interaction) {
  const roleId = process.env.STREAM_ROLE_ID;
  if (!roleId) {
    await interaction.reply({ content: 'Stream notification role is not configured.', ephemeral: true });
    return;
  }

  try {
    const role = await interaction.guild.roles.fetch(roleId);
    if (!role) {
      await interaction.reply({ content: 'Stream notification role not found.', ephemeral: true });
      return;
    }

    const member = interaction.member;
    if (!member.roles.cache.has(roleId)) {
      await interaction.reply({ content: "You don't have the stream notification role!", ephemeral: true });
      return;
    }

    await member.roles.remove(role);
    await interaction.reply({ content: 'You will no longer be notified when the stream goes live.', ephemeral: true });
  } catch (error) {
    log.error('Error removing stream role', error);
    await interaction.reply({ content: 'An error occurred while removing the role. Please try again later.', ephemeral: true });
  }
}

export default {
  data: commands,
  async execute(interaction, client, db, streamHandler) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (interaction.commandName === 'stream') {
      if (subcommand === 'status') {
        await handleStreamStatus(interaction, streamHandler);
      } else if (subcommand === 'clip') {
        if (!streamHandler) {
          await interaction.reply({ content: 'Stream system not initialized yet.', ephemeral: true });
          return;
        }
        await streamHandler.createClip(interaction);
      } else if (subcommand === 'link') {
        await handleAccountLink(interaction, db);
      }
      return;
    }

    if (interaction.commandName === 'streamrole') {
      if (subcommand === 'join') {
        await handleJoinStreamRole(interaction);
      } else if (subcommand === 'leave') {
        await handleLeaveStreamRole(interaction);
      }
    }
  }
};
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createLogger } from '../../utils/logger.js';
import { EPHEMERAL } from '../../utils/flags.js';

const logger = createLogger('Cmd/stream');

async function handleStreamStatus(interaction, streamHandler) {
  if (!streamHandler) {
    return interaction.reply({ content: 'Stream system not initialized yet.', flags: EPHEMERAL });
  }

  if (streamHandler.isLive) {
    const platform = streamHandler.currentPlatform;
    const start = streamHandler.streamStartTime instanceof Date ? streamHandler.streamStartTime : new Date(Date.now());
    const streamTime = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
    const hours = Math.floor(streamTime / 3600);
    const minutes = Math.floor((streamTime % 3600) / 60);

    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('Stream Status')
      .setDescription(`**${streamHandler.twitchChannel || 'Streamer'}** is currently **LIVE** on ${platform}!`)
      .addFields(
        { name: 'Current Viewers', value: String(streamHandler.currentViewers ?? 0), inline: true },
        { name: 'Uptime', value: `${hours}h ${minutes}m`, inline: true },
        {
          name: 'Watch Now',
          value: platform === 'twitch'
            ? `[Watch on Twitch](https://twitch.tv/${streamHandler.twitchChannel})`
            : `[Watch on YouTube](https://youtube.com/channel/${streamHandler.youtubeChannelId}/live)`
        }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
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

    return interaction.reply({ embeds: [embed], components: [row] });
  }

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

  return interaction.reply({ embeds: [embed] });
}

async function handleAccountLink(interaction, db) {
  const platform = interaction.options.getString('platform');
  const username = interaction.options.getString('username');
  const userId = interaction.user.id;

  try {
    const existing = db.prepare('SELECT * FROM user_links WHERE discord_id = ?').get(userId);
    if (existing) {
      if (platform === 'twitch') {
        db.prepare('UPDATE user_links SET twitch_username = ? WHERE discord_id = ?').run(username, userId);
      } else {
        db.prepare('UPDATE user_links SET youtube_username = ? WHERE discord_id = ?').run(username, userId);
      }
    } else {
      if (platform === 'twitch') {
        db.prepare('INSERT INTO user_links (discord_id, twitch_username) VALUES (?, ?)').run(userId, username);
      } else {
        db.prepare('INSERT INTO user_links (discord_id, youtube_username) VALUES (?, ?)').run(userId, username);
      }
    }

    return interaction.reply({ content: `Linked your ${platform === 'twitch' ? 'Twitch' : 'YouTube'} account (${username}).`, flags: EPHEMERAL });
  } catch (e) {
    logger.error('link error', e);
    return interaction.reply({ content: 'Error linking your account. Try again later.', flags: EPHEMERAL });
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('stream')
    .setDescription('Stream-related commands')
    .addSubcommand(sub => sub.setName('status').setDescription('Check if the streamer is live'))
    .addSubcommand(sub => sub.setName('clip').setDescription('Create a clip of the current stream'))
    .addSubcommand(sub =>
      sub
        .setName('link')
        .setDescription('Link your Twitch/YouTube account to Discord')
        .addStringOption(o =>
          o
            .setName('platform')
            .setDescription('The platform to link')
            .setRequired(true)
            .addChoices({ name: 'Twitch', value: 'twitch' }, { name: 'YouTube', value: 'youtube' })
        )
        .addStringOption(o =>
          o
            .setName('username')
            .setDescription('Your username on the selected platform')
            .setRequired(true)
        )
    ),

  async execute(interaction, client, db, streamHandler) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'status') return handleStreamStatus(interaction, streamHandler);
    if (sub === 'clip') {
      if (!streamHandler) return interaction.reply({ content: 'Stream system not initialized yet.', flags: EPHEMERAL });
      return streamHandler.createClip(interaction);
    }
    if (sub === 'link') return handleAccountLink(interaction, db);
  }
};

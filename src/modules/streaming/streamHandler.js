import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import fetch from 'node-fetch';
import { log } from '../../utils/logger.js';

class StreamHandler {
  constructor(client, db) {
    this.client = client;
    this.db = db;
    this.isLive = false;
    this.currentViewers = 0;
    this.streamStartTime = null;
    this.thumbnailUpdateInterval = null;
    this.followersCount = 0;
    this.subscribersCount = 0;
    this.lastMilestoneFollowers = 0;
    this.lastMilestoneSubscribers = 0;
    this.streamNotificationMessageId = null;
    this.currentPlatform = null;
    this.userClipCooldowns = new Map();
    
    this.loadConfig();
  }

  loadConfig() {
    this.twitchClientId = process.env.TWITCH_CLIENT_ID;
    this.twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
    this.twitchChannel = process.env.TWITCH_CHANNEL;
    this.youtubeApiKey = process.env.YT_API_KEY;
    this.youtubeChannelId = process.env.YT_CHANNEL_ID;
    this.notificationChannelId = process.env.STREAM_NOTIFICATION_CHANNEL_ID;
    this.streamRoleId = process.env.STREAM_ROLE_ID;
    this.twitchSubRoleId = process.env.TWITCH_SUB_ROLE_ID;
    this.youtubeMemberRoleId = process.env.YOUTUBE_MEMBER_ROLE_ID;
    this.thumbnailUpdateInterval = parseInt(process.env.STREAM_THUMBNAIL_UPDATE_INTERVAL || '5', 10);
    this.milestonesEnabled = process.env.MILESTONE_ANNOUNCEMENTS_ENABLED === 'true';
    this.followerMilestones = (process.env.FOLLOWER_MILESTONE_INCREMENTS || '100,500,1000').split(',').map(Number);
    this.subscriberMilestones = (process.env.SUBSCRIBER_MILESTONE_INCREMENTS || '10,50,100').split(',').map(Number);
    this.clipsAllowedChannels = (process.env.CLIPS_ALLOWED_CHANNELS || '').split(',');
    this.clipsCooldown = parseInt(process.env.CLIPS_COOLDOWN_SECONDS || '60', 10);
    
    this.accessToken = null;
    this.tokenExpiry = 0;
  }

  async initialize() {
    log.info('Initializing stream handler');
    
    // Set up check interval (every 2 minutes)
    setInterval(() => this.checkStreamStatus(), 2 * 60 * 1000);
    
    // Do initial check
    await this.checkStreamStatus();
    
    // Set up subscriber role sync (daily)
    setInterval(() => this.syncSubscriberRoles(), 24 * 60 * 60 * 1000);
    
    log.info('Stream handler initialized');
    return this;
  }

  async getTwitchAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${this.twitchClientId}&client_secret=${this.twitchClientSecret}&grant_type=client_credentials`, {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (data.access_token) {
        this.accessToken = data.access_token;
        this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 300000; // 5 minutes before actual expiry
        return this.accessToken;
      } else {
        log.error('Failed to get Twitch access token', data);
        return null;
      }
    } catch (error) {
      log.error('Error getting Twitch access token', error);
      return null;
    }
  }

  async checkStreamStatus() {
    try {
      // Check Twitch first
      const twitchLive = await this.checkTwitchStatus();
      
      // If not live on Twitch, check YouTube
      if (!twitchLive) {
        await this.checkYouTubeStatus();
      }
    } catch (error) {
      log.error('Error checking stream status', error);
    }
  }

  async checkTwitchStatus() {
    const token = await this.getTwitchAccessToken();
    if (!token) return false;
    
    try {
      const response = await fetch(`https://api.twitch.tv/helix/streams?user_login=${this.twitchChannel}`, {
        headers: {
          'Client-ID': this.twitchClientId,
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      
      if (data.data && data.data.length > 0) {
        // Stream is live
        const streamData = data.data[0];
        const wasLive = this.isLive;
        this.isLive = true;
        this.currentViewers = streamData.viewer_count;
        this.currentPlatform = 'twitch';
        
        if (!wasLive) {
          // Just went live
          this.streamStartTime = new Date();
          await this.handleStreamStart('twitch', streamData);
          this.startThumbnailUpdates('twitch');
        } else {
          // Update viewer count and other metrics
          await this.updateStreamInfo('twitch', streamData);
          await this.checkMilestones('twitch');
        }
        
        return true;
      } else if (this.isLive && this.currentPlatform === 'twitch') {
        // Stream went offline
        await this.handleStreamEnd('twitch');
        return false;
      }
      
      return false;
    } catch (error) {
      log.error('Error checking Twitch status', error);
      return false;
    }
  }

  async checkYouTubeStatus() {
    try {
      const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${this.youtubeChannelId}&type=video&eventType=live&key=${this.youtubeApiKey}`);
      
      const data = await response.json();
      
      if (data.items && data.items.length > 0) {
        // Stream is live
        const streamData = data.items[0];
        const wasLive = this.isLive;
        this.isLive = true;
        this.currentPlatform = 'youtube';
        
        // Get video details for viewer count
        const videoId = streamData.id.videoId;
        const videoResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,liveStreamingDetails&id=${videoId}&key=${this.youtubeApiKey}`);
        const videoData = await videoResponse.json();
        
        if (videoData.items && videoData.items.length > 0) {
          const videoDetails = videoData.items[0];
          this.currentViewers = parseInt(videoDetails.liveStreamingDetails.concurrentViewers || '0', 10);
          
          if (!wasLive) {
            // Just went live
            this.streamStartTime = new Date();
            await this.handleStreamStart('youtube', videoDetails);
            this.startThumbnailUpdates('youtube', videoId);
          } else {
            // Update viewer count and other metrics
            await this.updateStreamInfo('youtube', videoDetails);
            await this.checkMilestones('youtube');
          }
          
          return true;
        }
      } else if (this.isLive && this.currentPlatform === 'youtube') {
        // Stream went offline
        await this.handleStreamEnd('youtube');
      }
      
      return false;
    } catch (error) {
      log.error('Error checking YouTube status', error);
      return false;
    }
  }

  async handleStreamStart(platform, streamData) {
    const channel = this.client.channels.cache.get(this.notificationChannelId);
    if (!channel) return;
    
    let title, thumbnailUrl, streamUrl, gameTitle;
    
    if (platform === 'twitch') {
      title = streamData.title;
      thumbnailUrl = streamData.thumbnail_url.replace('{width}', '1280').replace('{height}', '720');
      streamUrl = `https://twitch.tv/${this.twitchChannel}`;
      gameTitle = streamData.game_name;
      
      // Get channel info for profile image
      const token = await this.getTwitchAccessToken();
      const userResponse = await fetch(`https://api.twitch.tv/helix/users?login=${this.twitchChannel}`, {
        headers: {
          'Client-ID': this.twitchClientId,
          'Authorization': `Bearer ${token}`
        }
      });
      const userData = await userResponse.json();
      
      if (userData.data && userData.data.length > 0) {
        // Get follower count
        const followersResponse = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${userData.data[0].id}`, {
          headers: {
            'Client-ID': this.twitchClientId,
            'Authorization': `Bearer ${token}`
          }
        });
        const followersData = await followersResponse.json();
        this.followersCount = followersData.total || 0;
        this.lastMilestoneFollowers = this.followersCount;
      }
    } else {
      // YouTube
      title = streamData.snippet.title;
      thumbnailUrl = streamData.snippet.thumbnails.high.url;
      const videoId = streamData.id;
      streamUrl = `https://youtube.com/watch?v=${videoId}`;
      gameTitle = streamData.snippet.categoryId || 'YouTube Gaming';
      
      // Get subscriber count
      const channelResponse = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${this.youtubeChannelId}&key=${this.youtubeApiKey}`);
      const channelData = await channelResponse.json();
      
      if (channelData.items && channelData.items.length > 0) {
        this.subscribersCount = parseInt(channelData.items[0].statistics.subscriberCount || '0', 10);
        this.lastMilestoneSubscribers = this.subscribersCount;
      }
    }
    
    // Create embed
    const embed = new EmbedBuilder()
      .setColor('#6441A4')
      .setTitle(`${platform === 'twitch' ? '🟣 Twitch' : '🔴 YouTube'} | ${title}`)
      .setDescription(`**${this.twitchChannel}** is now live on ${platform === 'twitch' ? 'Twitch' : 'YouTube'}!`)
      .addFields(
        { name: '🎮 Game', value: gameTitle || 'Just Chatting', inline: true },
        { name: '👁️ Viewers', value: this.currentViewers.toString(), inline: true },
        { name: '⏰ Started', value: `<t:${Math.floor(this.streamStartTime.getTime() / 1000)}:R>`, inline: true }
      )
      .setImage(thumbnailUrl)
      .setURL(streamUrl)
      .setFooter({ text: `Click the title to watch the stream!` });
      
    // Create buttons
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel(`Watch on ${platform === 'twitch' ? 'Twitch' : 'YouTube'}`)
          .setStyle(ButtonStyle.Link)
          .setURL(streamUrl),
        new ButtonBuilder()
          .setCustomId('clip_stream')
          .setLabel('Create Clip')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📹')
      );
    
    // Ping role if configured
    let content = '';
    if (this.streamRoleId) {
      content = `<@&${this.streamRoleId}> ${this.twitchChannel} is now live on ${platform === 'twitch' ? 'Twitch' : 'YouTube'}!`;
    }
    
    const message = await channel.send({ content, embeds: [embed], components: [row] });
    this.streamNotificationMessageId = message.id;
    
    // Also log to database
    try {
      await this.db.run(
        `INSERT INTO stream_events (platform, event_type, event_data) VALUES (?, ?, ?)`,
        [platform, 'stream_start', JSON.stringify({ 
          title, 
          game: gameTitle, 
          start_time: this.streamStartTime.toISOString()
        })]
      );
      
      // Start new stream stats
      await this.db.run(
        `INSERT INTO stream_stats (platform, stream_id, start_time, peak_viewers) VALUES (?, ?, ?, ?)`,
        [platform, platform === 'twitch' ? streamData.id : streamData.id.videoId, this.streamStartTime.toISOString(), this.currentViewers]
      );
    } catch (error) {
      log.error('Error logging stream start to database', error);
    }
  }

  async updateStreamInfo(platform, streamData) {
    if (!this.streamNotificationMessageId) return;
    
    const channel = this.client.channels.cache.get(this.notificationChannelId);
    if (!channel) return;
    
    try {
      const message = await channel.messages.fetch(this.streamNotificationMessageId);
      
      if (!message) return;
      
      const embed = message.embeds[0];
      
      // Update viewer count field
      const fields = [...embed.fields];
      fields[1] = { name: '👁️ Viewers', value: this.currentViewers.toString(), inline: true };
      
      // Uptime field
      const uptime = Math.floor((Date.now() - this.streamStartTime.getTime()) / 1000);
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      fields[2] = { name: '⏰ Uptime', value: `${hours}h ${minutes}m`, inline: true };
      
      // Update thumbnail if needed
      let newEmbed;
      if (platform === 'twitch') {
        const thumbnailUrl = streamData.thumbnail_url.replace('{width}', '1280').replace('{height}', '720') + `?t=${Date.now()}`;
        newEmbed = EmbedBuilder.from(embed).setFields(fields).setImage(thumbnailUrl);
      } else {
        // YouTube doesn't need thumbnail refresh as often
        newEmbed = EmbedBuilder.from(embed).setFields(fields);
      }
      
      await message.edit({ embeds: [newEmbed] });
      
      // Update peak viewers in database if needed
      try {
        const streamId = platform === 'twitch' ? streamData.id : streamData.id;
        // Update peak viewers if current is higher
        await this.db.run(
          `UPDATE stream_stats SET peak_viewers = MAX(peak_viewers, ?), average_viewers = (average_viewers + ?) / 2 
           WHERE platform = ? AND stream_id = ? AND end_time IS NULL`,
          [this.currentViewers, this.currentViewers, platform, streamId]
        );
      } catch (error) {
        log.error('Error updating stream stats in database', error);
      }
    } catch (error) {
      log.error('Error updating stream info', error);
    }
  }

  async handleStreamEnd(platform) {
    this.isLive = false;
    this.stopThumbnailUpdates();
    
    if (!this.streamNotificationMessageId) return;
    
    const channel = this.client.channels.cache.get(this.notificationChannelId);
    if (!channel) return;
    
    try {
      const message = await channel.messages.fetch(this.streamNotificationMessageId);
      
      if (!message) return;
      
      const embed = message.embeds[0];
      
      // Calculate stream duration
      const duration = Math.floor((Date.now() - this.streamStartTime.getTime()) / 1000);
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      
      // Update embed
      const updatedEmbed = EmbedBuilder.from(embed)
        .setColor('#808080')
        .setTitle(`[ENDED] ${embed.title}`)
        .setDescription(`**${this.twitchChannel}** was live on ${platform === 'twitch' ? 'Twitch' : 'YouTube'}!`)
        .setFields(
          { name: '📊 Duration', value: `${hours}h ${minutes}m`, inline: true },
          { name: '👁️ Peak Viewers', value: this.currentViewers.toString(), inline: true },
          { name: '⏰ Ended', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        );
      
      // Remove buttons
      await message.edit({ embeds: [updatedEmbed], components: [] });
      
      // Update database
      try {
        const streamId = platform === 'twitch' ? message.embeds[0].url.split('/').pop() : message.embeds[0].url.split('=').pop();
        await this.db.run(
          `UPDATE stream_stats SET end_time = ?, chat_messages = ? WHERE platform = ? AND stream_id = ? AND end_time IS NULL`,
          [new Date().toISOString(), 0, platform, streamId]
        );
        
        await this.db.run(
          `INSERT INTO stream_events (platform, event_type, event_data) VALUES (?, ?, ?)`,
          [platform, 'stream_end', JSON.stringify({ 
            duration_seconds: duration,
            peak_viewers: this.currentViewers,
            end_time: new Date().toISOString()
          })]
        );
      } catch (error) {
        log.error('Error updating stream end in database', error);
      }
      
      // Reset notification message ID
      this.streamNotificationMessageId = null;
      this.currentPlatform = null;
    } catch (error) {
      log.error('Error handling stream end', error);
    }
  }

  startThumbnailUpdates(platform, videoId = null) {
    // Clear any existing interval
    this.stopThumbnailUpdates();
    
    // Set up new interval
    this.thumbnailUpdateTimer = setInterval(async () => {
      try {
        if (platform === 'twitch') {
          await this.checkTwitchStatus();
        } else {
          await this.checkYouTubeStatus();
        }
      } catch (error) {
        log.error('Error in thumbnail update interval', error);
      }
    }, this.thumbnailUpdateInterval * 60 * 1000);
  }

  stopThumbnailUpdates() {
    if (this.thumbnailUpdateTimer) {
      clearInterval(this.thumbnailUpdateTimer);
      this.thumbnailUpdateTimer = null;
    }
  }

  async checkMilestones(platform) {
    if (!this.milestonesEnabled) return;
    
    try {
      if (platform === 'twitch') {
        // Check follower milestones
        const token = await this.getTwitchAccessToken();
        const userResponse = await fetch(`https://api.twitch.tv/helix/users?login=${this.twitchChannel}`, {
          headers: {
            'Client-ID': this.twitchClientId,
            'Authorization': `Bearer ${token}`
          }
        });
        const userData = await userResponse.json();
        
        if (userData.data && userData.data.length > 0) {
          const userId = userData.data[0].id;
          
          // Get follower count
          const followersResponse = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${userId}`, {
            headers: {
              'Client-ID': this.twitchClientId,
              'Authorization': `Bearer ${token}`
            }
          });
          const followersData = await followersResponse.json();
          const currentFollowers = followersData.total || 0;
          
          // Check if we've hit a milestone
          for (const milestone of this.followerMilestones) {
            if (currentFollowers >= milestone && this.lastMilestoneFollowers < milestone) {
              await this.announceMilestone('followers', milestone);
              this.lastMilestoneFollowers = currentFollowers;
              break;
            }
          }
        }
      } else {
        // YouTube
        const channelResponse = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${this.youtubeChannelId}&key=${this.youtubeApiKey}`);
        const channelData = await channelResponse.json();
        
        if (channelData.items && channelData.items.length > 0) {
          const currentSubscribers = parseInt(channelData.items[0].statistics.subscriberCount || '0', 10);
          
          // Check if we've hit a milestone
          for (const milestone of this.subscriberMilestones) {
            if (currentSubscribers >= milestone && this.lastMilestoneSubscribers < milestone) {
              await this.announceMilestone('subscribers', milestone);
              this.lastMilestoneSubscribers = currentSubscribers;
              break;
            }
          }
        }
      }
    } catch (error) {
      log.error('Error checking milestones', error);
    }
  }

  async announceMilestone(type, count) {
    const channel = this.client.channels.cache.get(this.notificationChannelId);
    if (!channel) return;
    
    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle(`🎉 Milestone Reached! 🎉`)
      .setDescription(`We just reached **${count.toLocaleString()}** ${type}!\nThank you to everyone for your support!`)
      .setTimestamp();
    
    await channel.send({ embeds: [embed] });
    
    // Log to database
    try {
      await this.db.run(
        `INSERT INTO stream_milestones (milestone_type, milestone_value, announced) VALUES (?, ?, 1)`,
        [type, count]
      );
    } catch (error) {
      log.error('Error logging milestone to database', error);
    }
  }

  async syncSubscriberRoles() {
    if (!this.twitchSubRoleId && !this.youtubeMemberRoleId) return;
    
    log.info('Starting subscriber role sync');
    
    try {
      const guild = this.client.guilds.cache.first();
      if (!guild) return;
      
      // Sync Twitch subscribers
      if (this.twitchSubRoleId) {
        const token = await this.getTwitchAccessToken();
        const userResponse = await fetch(`https://api.twitch.tv/helix/users?login=${this.twitchChannel}`, {
          headers: {
            'Client-ID': this.twitchClientId,
            'Authorization': `Bearer ${token}`
          }
        });
        const userData = await userResponse.json();
        
        if (userData.data && userData.data.length > 0) {
          const userId = userData.data[0].id;
          
          // Get subscriber list
          // Note: This requires an app access token with channel:read:subscriptions scope
          const subscribersResponse = await fetch(`https://api.twitch.tv/helix/subscriptions?broadcaster_id=${userId}`, {
            headers: {
              'Client-ID': this.twitchClientId,
              'Authorization': `Bearer ${token}`
            }
          });
          
          const subscribersData = await subscribersResponse.json();
          
          if (subscribersData.data) {
            // First query Discord users from the database
            const discordTwitchLinks = await this.db.all(`SELECT discord_id, twitch_username FROM user_links WHERE twitch_username IS NOT NULL`);
            
            // Create a map for faster lookups
            const twitchToDiscordMap = new Map();
            for (const link of discordTwitchLinks) {
              twitchToDiscordMap.set(link.twitch_username.toLowerCase(), link.discord_id);
            }
            
            // Get the subscriber role
            const subRole = await guild.roles.fetch(this.twitchSubRoleId);
            if (!subRole) return;
            
            // Process subscribers
            for (const sub of subscribersData.data) {
              const twitchUsername = sub.user_name.toLowerCase();
              const discordId = twitchToDiscordMap.get(twitchUsername);
              
              if (discordId) {
                try {
                  const member = await guild.members.fetch(discordId);
                  if (member && !member.roles.cache.has(this.twitchSubRoleId)) {
                    await member.roles.add(subRole);
                    log.info(`Added Twitch sub role to ${member.user.tag}`);
                  }
                } catch (error) {
                  log.error(`Error adding role to member ${discordId}`, error);
                }
              }
            }
            
            // Remove roles from non-subscribers
            const membersWithRole = await guild.members.fetch();
            for (const [memberId, member] of membersWithRole.filter(m => m.roles.cache.has(this.twitchSubRoleId))) {
              const discordId = member.id;
              let foundAsSub = false;
              
              // Check if this user is in our link database
              for (const [twitchName, linkedDiscordId] of twitchToDiscordMap.entries()) {
                if (linkedDiscordId === discordId) {
                  // Check if this Twitch user is in the subscribers list
                  const isSubscriber = subscribersData.data.some(sub => sub.user_name.toLowerCase() === twitchName);
                  if (isSubscriber) {
                    foundAsSub = true;
                    break;
                  }
                }
              }
              
              if (!foundAsSub) {
                try {
                  await member.roles.remove(subRole);
                  log.info(`Removed Twitch sub role from ${member.user.tag}`);
                } catch (error) {
                  log.error(`Error removing role from member ${discordId}`, error);
                }
              }
            }
          }
        }
      }
      
      // YouTube Members sync would work similarly but requires special API access
      // Typically requires a members-only endpoint that isn't available in the standard API
      
    } catch (error) {
      log.error('Error syncing subscriber roles', error);
    }
  }

  async createClip(interaction) {
    if (!this.isLive) {
      await interaction.reply({ content: 'Cannot create a clip when the stream is offline!', ephemeral: true });
      return;
    }
    
    // Check if user is on cooldown
    const userId = interaction.user.id;
    const lastClipTime = this.userClipCooldowns.get(userId) || 0;
    if (Date.now() - lastClipTime < this.clipsCooldown * 1000) {
      const remainingTime = Math.ceil((lastClipTime + (this.clipsCooldown * 1000) - Date.now()) / 1000);
      await interaction.reply({ content: `You need to wait ${remainingTime} seconds before creating another clip!`, ephemeral: true });
      return;
    }
    
    await interaction.deferReply();
    
    try {
      if (this.currentPlatform === 'twitch') {
        const token = await this.getTwitchAccessToken();
        const userResponse = await fetch(`https://api.twitch.tv/helix/users?login=${this.twitchChannel}`, {
          headers: {
            'Client-ID': this.twitchClientId,
            'Authorization': `Bearer ${token}`
          }
        });
        const userData = await userResponse.json();
        
        if (userData.data && userData.data.length > 0) {
          const broadcasterId = userData.data[0].id;
          
          // Create clip
          const clipResponse = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}`, {
            method: 'POST',
            headers: {
              'Client-ID': this.twitchClientId,
              'Authorization': `Bearer ${token}`
            }
          });
          
          const clipData = await clipResponse.json();
          
          if (clipData.data && clipData.data.length > 0) {
            const clipId = clipData.data[0].id;
            const clipUrl = `https://clips.twitch.tv/${clipId}`;
            
            // Set cooldown
            this.userClipCooldowns.set(userId, Date.now());
            
            // Log to database
            await this.db.run(
              `INSERT INTO stream_clips (platform, clip_id, creator_id, url) VALUES (?, ?, ?, ?)`,
              ['twitch', clipId, userId, clipUrl]
            );
            
            await interaction.editReply(`Clip created successfully! It may take a moment to process.\n${clipUrl}`);
          } else {
            await interaction.editReply('Failed to create clip. Please try again later.');
          }
        } else {
          await interaction.editReply('Could not find the channel. Please try again later.');
        }
      } else {
        // YouTube doesn't have a public API for creating clips
        await interaction.editReply('Clips are only supported for Twitch streams at this time.');
      }
    } catch (error) {
      log.error('Error creating clip', error);
      await interaction.editReply('An error occurred while creating the clip. Please try again later.');
    }
  }
}

export default StreamHandler;

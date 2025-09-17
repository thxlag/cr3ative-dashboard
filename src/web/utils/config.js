export const DASHBOARD_GUILD_ID = process.env.DASHBOARD_GUILD_ID?.trim() || process.env.GUILD_ID?.trim() || '994380454763450499';
export const DASHBOARD_GUILD_NAME = process.env.DASHBOARD_GUILD_NAME?.trim() || 'Thxlag\'s Server';
export const BOT_TOKEN = process.env.BOT_TOKEN?.trim() || '';
export const DASHBOARD_FEATURE_FLAGS = {
  allowDiscordFetch: BOT_TOKEN.length > 0
};

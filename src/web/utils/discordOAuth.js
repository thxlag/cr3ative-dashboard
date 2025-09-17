const DISCORD_API_BASE = 'https://discord.com/api';

function getOAuthConfig() {
  const clientId = process.env.DASHBOARD_CLIENT_ID?.trim();
  const clientSecret = process.env.DASHBOARD_CLIENT_SECRET?.trim();
  const redirectUri = process.env.DASHBOARD_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing DASHBOARD_CLIENT_ID, DASHBOARD_CLIENT_SECRET, or DASHBOARD_REDIRECT_URI in environment.');
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
}

export function buildAuthUrl(state = 'dashboard') {
  const { clientId, redirectUri } = getOAuthConfig();
  const scope = 'identify guilds guilds.members.read';
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: scope,
    redirect_uri: redirectUri,
    prompt: 'consent',
    state,
  });
  return `${DISCORD_API_BASE}/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code) {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord token exchange failed: ${response.status} ${text}`);
  }
  return response.json();
}

export async function fetchDiscordUser(accessToken) {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord user fetch failed: ${response.status} ${text}`);
  }
  return response.json();
}

export async function fetchDiscordGuilds(accessToken) {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord guild fetch failed: ${response.status} ${text}`);
  }
  return response.json();
}

const MANAGE_GUILD_BIT = 1n << 5n; // 0x20

export function filterAdminGuilds(guilds = []) {
  return guilds.filter((guild) => {
    if (!guild?.permissions_new) return false;
    try {
      const perm = BigInt(guild.permissions_new);
      return (perm & MANAGE_GUILD_BIT) === MANAGE_GUILD_BIT;
    } catch {
      return false;
    }
  });
}

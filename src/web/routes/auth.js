import { Router } from 'express';
import {
  buildAuthUrl,
  exchangeCodeForToken,
  fetchDiscordUser,
  fetchDiscordGuilds,
  filterAdminGuilds,
} from '../utils/discordOAuth.js';
import { DASHBOARD_GUILD_ID, DASHBOARD_GUILD_NAME } from '../utils/config.js';

const router = Router();

router.get('/auth/login', (req, res) => {
  try {
    const state = typeof req.query.state === 'string' ? req.query.state : 'dashboard';
    const url = buildAuthUrl(state);
    res.redirect(url);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/auth/callback', async (req, res) => {
  const { code, error: oauthError } = req.query;

  if (oauthError) {
    return res.status(400).send(`OAuth error: ${oauthError}`);
  }
  if (!code || typeof code !== 'string') {
    return res.status(400).send('Missing code parameter');
  }

  try {
    const token = await exchangeCodeForToken(code);
    const user = await fetchDiscordUser(token.access_token);
    const guilds = await fetchDiscordGuilds(token.access_token);
    const adminGuilds = filterAdminGuilds(guilds);
    const allowedGuild = adminGuilds.find((g) => g.id === DASHBOARD_GUILD_ID);
    const adminList = allowedGuild ? [{ id: allowedGuild.id, name: allowedGuild.name }] : [{ id: DASHBOARD_GUILD_ID, name: DASHBOARD_GUILD_NAME }];

    req.session.user = {
      id: user.id,
      username: user.username,
      global_name: user.global_name,
      avatar: user.avatar,
      adminGuilds: adminList,
    };
    req.session.oauth = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + (token.expires_in || 0) * 1000,
      scope: token.scope,
      tokenType: token.token_type,
    };

    res.send('Login successful. You can close this window.');
  } catch (error) {
    res.status(500).send(`OAuth callback failed: ${error.message}`);
  }
});

router.post('/auth/logout', (req, res) => {
  req.session?.destroy?.(() => {
    res.json({ success: true });
  });
});

router.get('/auth/session', (req, res) => {
  if (!req.session?.user) {
    return res.json({ authenticated: false });
  }
  return res.json({
    authenticated: true,
    user: req.session.user,
  });
});

export default router;



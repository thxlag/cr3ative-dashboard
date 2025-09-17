const ownerId = process.env.OWNER_ID?.trim();

export function requireAuth(req, res, next) {
  if (req.session?.user) {
    return next();
  }
  return res.status(401).json({ error: 'Authentication required' });
}

export function requireAdmin(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (ownerId && req.session.user.id === ownerId) {
    return next();
  }

  const adminGuilds = req.session.user.adminGuilds || [];
  if (adminGuilds.length === 0) {
    return res.status(403).json({ error: 'You need Manage Server permission in at least one guild.' });
  }

  return next();
}

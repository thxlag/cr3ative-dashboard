export function isAdmin(interaction){
  const ownerId = process.env.OWNER_ID?.trim();
  if (ownerId && interaction.user.id === ownerId) return true;

  const roleCsv = process.env.ADMIN_ROLE_IDS || '';
  const adminRoles = roleCsv.split(',').map(s=>s.trim()).filter(Boolean);
  if (!adminRoles.length) return false;

  const roles = interaction.member?.roles;
  if (!roles) return false;

  const has = typeof roles.cache?.some === 'function'
    ? roles.cache.some(r => adminRoles.includes(r.id))
    : (Array.isArray(roles) && roles.some(id => adminRoles.includes(id)));

  return has;
}

// Pure policy helpers shared by appeal handling and regression tests.
function alertRoles(settings) {
  const roles = Array.isArray(settings?.alert_role_ids)
    ? settings.alert_role_ids
    : settings?.alert_role_id ? [settings.alert_role_id] : [];
  return [...new Set(roles.filter((id) => /^\d{5,25}$/.test(id)))].slice(0, 20);
}

function canReverseTimeout(infraction, currentUntil, newerPunishment) {
  if (newerPunishment || !infraction.punishment_expires_at || !currentUntil) return false;
  return Math.abs(new Date(infraction.punishment_expires_at).getTime() - currentUntil) < 1000;
}

function canReverseBan(infraction, banReason, newerPunishment) {
  return !newerPunishment && typeof banReason === "string" && banReason.includes(`case:${infraction.id}`);
}

module.exports = { alertRoles, canReverseTimeout, canReverseBan };
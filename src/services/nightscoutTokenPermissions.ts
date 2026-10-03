/** Nightscout's authorization response includes the subject AND default roles. */
export const hasReadOnlyNightscoutPermissions = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const groups = (value as {permissionGroups?: unknown}).permissionGroups;
  if (!Array.isArray(groups) || groups.some(group => !Array.isArray(group))) {
    return false;
  }
  const permissions: string[] = [];
  for (const group of groups) {
    for (const grant of group) {
      if (typeof grant !== 'string') {
        return false;
      }
      const parts = grant.split(':');
      // Fail closed for wildcard actions, admin grants, unknown syntax and
      // create/update/delete/list grants. The standard readable role is *:*:read.
      if (
        parts.length !== 3 ||
        !['api', '*'].includes(parts[0] ?? '') ||
        !/^[a-z*]+(?:,[a-z*]+)*$/.test(parts[1] ?? '') ||
        parts[2] !== 'read'
      ) {
        return false;
      }
      permissions.push(grant);
    }
  }
  return ['entries', 'treatments', 'profile', 'devicestatus', 'status'].every(
    resource =>
      permissions.some(grant => {
        const parts = grant.split(':');
        const resources = (parts[1] ?? '').split(',');
        return resources.includes('*') || resources.includes(resource);
      }),
  );
};

/** Only persistent subject tokens; temporary JWTs and master secrets are rejected. */
export const normalizeNightscoutAccessToken = (raw: string): string | null => {
  const value = raw.trim().replace(/^token=/, '');
  return /^[a-z0-9_-]{1,96}-[a-f0-9]{16,64}$/i.test(value) ? value : null;
};

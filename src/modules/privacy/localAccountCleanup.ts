/** Only keys explicitly scoped to this owner, or records stamped by the owner. */
export const belongsToAccount = (
  key: string,
  raw: string | null,
  uid: string,
  accountHash?: string,
): boolean => {
  const encoded = encodeURIComponent(uid);
  if (
    [
      uid,
      encoded,
      ...(accountHash ? [accountHash, `u${accountHash}`] : []),
    ].some(token => key.split(/[:.\/]/).includes(token))
  ) {
    return true;
  }
  if (raw === null) {
    return false;
  }
  try {
    return ownsRecord(JSON.parse(raw), uid);
  } catch {
    return false;
  }
};
const ownsRecord = (value: unknown, uid: string): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  const data = value as Record<string, unknown>;
  if (
    [data.productUserId, data.ownerProductUserId, data.ownerUserId].includes(
      uid,
    )
  ) {
    return true;
  }
  return data.scope !== undefined && ownsRecord(data.scope, uid);
};
export const collectManagedImageUris = (
  raw: string | null,
): readonly string[] => {
  if (!raw) {
    return [];
  }
  // URI strings are extracted from already-owner-scoped records only. The
  // platform file adapter validates its managed directory before removal.
  try {
    const uris = new Set<string>();
    const visit = (value: unknown): void => {
      if (
        typeof value === 'string' &&
        (value.includes('/meal-images/image_') ||
          value.startsWith('meal-image-idb:'))
      ) {
        uris.add(value);
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach(visit);
      }
    };
    visit(JSON.parse(raw));
    return [...uris];
  } catch {
    return [];
  }
};
export interface AccountCleanupStorage {
  getAllKeys(): Promise<readonly string[]>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
}
export const purgeLocalAccountData = async (
  storage: AccountCleanupStorage,
  uid: string,
  removeImage: (uri: string) => Promise<void>,
  accountHash?: string,
): Promise<void> => {
  const keys = await storage.getAllKeys();
  for (const key of keys) {
    if (key.startsWith('privacy.deletion.')) {
      continue;
    }
    const raw = await storage.getItem(key);
    if (belongsToAccount(key, raw, uid, accountHash)) {
      for (const uri of collectManagedImageUris(raw)) {
        await removeImage(uri);
      }
      await storage.removeItem(key);
    } else if (raw !== null) {
      // Legacy shared arrays are filtered record by record. A nested owner
      // stamp never grants authority to erase the entire shared value.
      let records: unknown;
      try {
        records = JSON.parse(raw);
      } catch {
        continue;
      }
      if (Array.isArray(records)) {
        const owned = records.filter(record => ownsRecord(record, uid));
        if (owned.length > 0) {
          for (const record of owned) {
            for (const uri of collectManagedImageUris(JSON.stringify(record))) {
              await removeImage(uri);
            }
          }
          const retained = records.filter(record => !ownsRecord(record, uid));
          if (retained.length > 0) {
            await storage.setItem(key, JSON.stringify(retained));
          } else {
            await storage.removeItem(key);
          }
        }
      }
    }
  }
};

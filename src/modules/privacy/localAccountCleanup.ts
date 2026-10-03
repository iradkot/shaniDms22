export interface LocalAccountWorkspaceScope {
  readonly productUserId: string;
  readonly workspaceId: string;
}

export const accountWorkspaceScopeId = (scope: LocalAccountWorkspaceScope): string =>
  `shani.workspace.v1:${encodeURIComponent(scope.productUserId)}:${encodeURIComponent(scope.workspaceId)}`;

const blockedOwners = new Set<string>();
const ownerWrites = new Map<string, Set<Promise<unknown>>>();
type LocalStorageReader = {getItem(key: string): Promise<string | null>};

export const assertLocalAccountActive = async (storage: LocalStorageReader, uid: string): Promise<void> => {
  if (blockedOwners.has(uid) || await storage.getItem(`privacy.deletion.pending:${uid}`) !== null) {
    throw new Error('Account deletion is in progress.');
  }
  if (blockedOwners.has(uid)) {
    throw new Error('Account deletion is in progress.');
  }
};

/** Registers the whole write before it starts, including a delayed storage call. */
export const withLocalAccountWrite = <T>(
  storage: LocalStorageReader,
  uid: string | undefined,
  operation: () => Promise<T>,
): Promise<T> => {
  if (uid === undefined) {
    return operation();
  }
  const pending = (async () => {
    await assertLocalAccountActive(storage, uid);
    const result = await operation();
    if (blockedOwners.has(uid)) {
      throw new Error('Account deletion is in progress.');
    }
    return result;
  })();
  const writes = ownerWrites.get(uid) ?? new Set<Promise<unknown>>();
  ownerWrites.set(uid, writes);
  writes.add(pending);
  const finished = () => {
    writes.delete(pending);
    if (writes.size === 0 && ownerWrites.get(uid) === writes) {
      ownerWrites.delete(uid);
    }
  };
  pending.then(finished, finished);
  return pending;
};

export const blockAndDrainLocalAccountWrites = async (uid: string): Promise<void> => {
  blockedOwners.add(uid);
  await Promise.allSettled([...(ownerWrites.get(uid) ?? [])]);
};

const structuredScopeOwner = (scope: unknown): string | undefined => {
  if (typeof scope !== 'string') {
    return undefined;
  }
  const parts = scope.split(':');
  const owner = parts.length === 5 && parts[0] === 'shani.ai' && parts[1] === 'v2'
    ? parts[3]
    : parts.length === 4 && parts[0] === 'shani.workspace' && parts[1] === 'v1'
      ? parts[2] : undefined;
  try {
    return owner === undefined ? undefined : decodeURIComponent(owner);
  } catch {
    return undefined;
  }
};

/** Only keys explicitly scoped to this owner, or records stamped by the owner. */
export const belongsToAccount = (
  key: string,
  raw: string | null,
  uid: string,
  accountHash?: string,
): boolean => {
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const explicitOwner = recordOwner(parsed);
      if (explicitOwner !== undefined) {
        return explicitOwner === uid;
      }
    } catch {
      /* keys below may still establish ownership */
    }
  }
  if (key.startsWith('shani.ai.recommendations.v1:')) {
    try {
      if (structuredScopeOwner(decodeURIComponent(key.slice('shani.ai.recommendations.v1:'.length))) === uid) {
        return true;
      }
    } catch {
      /* preserve unattributable legacy scopes */
    }
  }
  if (/^shani\.web\.(ai-history|alert-rules|update-center)\.v2:/.test(key)) {
    const owner = key.split(':')[1];
    try {
      return owner !== undefined && decodeURIComponent(owner) === uid;
    } catch {
      return false;
    }
  }
  const ownerPart = key.startsWith('journal:v1:') ? key.split(':')[2]
    : key.startsWith('shani.ai:v2:') ? key.split(':')[3]
      : /^(privacy\.consent\.(v1|pending)|meal\.image\.ownership\.v1|shani\.web\.connection-marker\.v1|shani\.web\.pre-meal-assistance\.v1|shani\.web\.meal-media-queue\.v1|shani\.alert-sync\.v1\.(rules|updates)|shani\.product-personalization(-sync)?\.v1\.[a-z-]+):/.test(key)
        ? key.split(':')[1] : undefined;
  try {
    if (ownerPart !== undefined && decodeURIComponent(ownerPart) === uid) {
      return true;
    }
  } catch {
    /* malformed owner components cannot authorize deletion */
  }
  if (accountHash && (key === `ai.settings.v2:u${accountHash}` || key === `ai.credential.intent.v1:u${accountHash}`)) {
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
const recordOwner = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const data = value as Record<string, unknown>;
  const direct = [data.productUserId, data.ownerProductUserId, data.ownerUserId]
    .find((owner): owner is string => typeof owner === 'string');
  return direct ?? structuredScopeOwner(data.ownerScope) ?? recordOwner(data.scope) ?? recordOwner(data.value);
};
const ownsRecord = (value: unknown, uid: string): boolean => {
  return recordOwner(value) === uid;
};

type WorkspaceOwners = Map<string, Set<string>>;
const rememberWorkspace = (owners: WorkspaceOwners, owner: unknown, workspace: unknown): void => {
  if (typeof owner !== 'string' || typeof workspace !== 'string' || !owner || !workspace) {
    return;
  }
  const legacyScope = `${owner}-${workspace}`;
  const candidates = owners.get(legacyScope) ?? new Set<string>();
  candidates.add(owner);
  owners.set(legacyScope, candidates);
  const workspaceCandidates = owners.get(`workspace:${workspace}`) ?? new Set<string>();
  workspaceCandidates.add(owner);
  owners.set(`workspace:${workspace}`, workspaceCandidates);
};

const workspaceOwners = (values: readonly [string, string | null][]): WorkspaceOwners => {
  const owners: WorkspaceOwners = new Map();
  for (const [key, raw] of values) {
    if (raw === null) {
      continue;
    }
    try {
      const value = JSON.parse(raw) as unknown;
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }
      const data = value as Record<string, unknown>;
      const envelope = data.value && typeof data.value === 'object' && !Array.isArray(data.value)
        ? data.value as Record<string, unknown> : data;
      const scope = data.scope && typeof data.scope === 'object'
        ? data.scope as Record<string, unknown>
        : envelope.scope && typeof envelope.scope === 'object'
          ? envelope.scope as Record<string, unknown> : data;
      rememberWorkspace(owners, scope.productUserId ?? scope.ownerProductUserId, scope.workspaceId);
      if (key.startsWith('shani.web.connection-marker.v1:') && data.schemaVersion === 1 &&
          data.nightscout && typeof data.nightscout === 'object') {
        rememberWorkspace(owners, key.slice('shani.web.connection-marker.v1:'.length),
          (data.nightscout as Record<string, unknown>).workspaceId);
      }
    } catch {
      /* only structural owner records establish a legacy scope */
    }
  }
  return owners;
};

const legacyBrowserScope = (key: string): string | undefined => {
  const prefix = ['shani.web.ai-history.v1:', 'shani.web.alert-rules.v1:', 'shani.web.update-center.v1:']
    .find(candidate => key.startsWith(candidate));
  if (prefix) {
    return key.slice(prefix.length);
  }
  if (key.startsWith('shani.ai.recommendations.v1:')) {
    try {
      return decodeURIComponent(key.slice('shani.ai.recommendations.v1:'.length));
    } catch {
      return undefined;
    }
  }
  return undefined;
};

const provenLegacyOwner = (key: string, uid: string, owners: WorkspaceOwners, raw: string | null): boolean => {
  try {
    const value = raw === null ? undefined : JSON.parse(raw) as unknown;
    if (Array.isArray(value) ? value.some(item => recordOwner(item) !== undefined && recordOwner(item) !== uid)
      : recordOwner(value) !== undefined && recordOwner(value) !== uid) {
      return false;
    }
  } catch {
    /* owner-bound namespace metadata is still sufficient for corrupt data */
  }
  const nativePrefix = ['notifications:rules:v2:', 'notifications:snooze:until:v2:', 'notifications:delivery-mode:v1:', 'product:update-center:history:v2:', 'product:update-center:read-state:v2:']
    .find(prefix => key.startsWith(prefix));
  const scope = nativePrefix === undefined ? legacyBrowserScope(key) : `workspace:${key.slice(nativePrefix.length)}`;
  const candidates = scope === undefined ? undefined : owners.get(scope);
  return candidates?.size === 1 && candidates.has(uid);
};

/** Legacy hyphenated scopes are read only when stored workspace ownership is unambiguous. */
export const readProvenLegacyAccountStore = async (
  storage: LocalStorageReader & {getAllKeys?(): Promise<readonly string[]>},
  key: string,
  scope: LocalAccountWorkspaceScope,
): Promise<string | null> => {
  await assertLocalAccountActive(storage, scope.productUserId);
  if (!storage.getAllKeys) {
    return null;
  }
  const keys = await storage.getAllKeys();
  const values = await Promise.all(keys.map(async item => [item, await storage.getItem(item)] as [string, string | null]));
  const value = values.find(([item]) => item === key)?.[1] ?? null;
  const owned = belongsToAccount(key, value, scope.productUserId) || provenLegacyOwner(key, scope.productUserId, workspaceOwners(values), value);
  await assertLocalAccountActive(storage, scope.productUserId);
  return owned ? value : null;
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
  await blockAndDrainLocalAccountWrites(uid);
  const keys = await storage.getAllKeys();
  const values = await Promise.all(keys.map(async key => [key, await storage.getItem(key)] as [string, string | null]));
  const owners = workspaceOwners(values);
  for (const [key, raw] of values) {
    if (key.startsWith('privacy.deletion.')) {
      continue;
    }
    if (belongsToAccount(key, raw, uid, accountHash) || provenLegacyOwner(key, uid, owners, raw)) {
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

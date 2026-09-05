import AsyncStorage from '@react-native-async-storage/async-storage';
import {sha1} from 'js-sha1';
import {nativeSecureCredentialStore} from './secureCredentialStore';

/**
 * A locally-stored Nightscout connection profile.
 *
 * Nightscout expects the `api-secret` request header to be the SHA1 hash of the
 * configured API secret (aka token / `API_SECRET`).
 */
export type NightscoutProfile = {
  id: string;
  label: string;
  baseUrl: string;
  /** SHA1 hex digest (40 lowercase hex chars) used as `api-secret` header. */
  apiSecretSha1: string;
  createdAt: number;
};

const LEGACY_PROFILES_STORAGE_KEY = 'nightscout.profiles.v1';
const LEGACY_ACTIVE_PROFILE_ID_KEY = 'nightscout.activeProfileId.v1';
const LEGACY_OWNER_USER_ID_KEY = 'nightscout.legacyOwnerUid.v1';
const LEGACY_QUARANTINE_KEY = 'nightscout.legacyQuarantine.v1';
const MAX_PROFILES = 32;

const isSha1Hex = (value: string): boolean =>
  /^[a-f0-9]{40}$/i.test(value.trim());

const isLocalNightscoutHost = (input: string): boolean => {
  const hostname = input.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === '::1' ||
    hostname.startsWith('fe8') ||
    hostname.startsWith('fe9') ||
    hostname.startsWith('fea') ||
    hostname.startsWith('feb') ||
    hostname.startsWith('fc') ||
    hostname.startsWith('fd')
  ) {
    return true;
  }
  const octets = hostname.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const first = octets[0];
  const second = octets[1];
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
};

/**
 * Normalizes user input into a stable Nightscout base URL.
 *
 * - Accepts `http://` or `https://`
 * - If scheme is missing, defaults to `https://`
 * - Trims trailing slashes
 * - Removes query/hash
 * - Preserves sub-path installs (e.g. `https://example.com/nightscout`)
 */
export const normalizeNightscoutUrl = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  // If the user provided a scheme, only allow http(s).
  // Without this, inputs like "ftp://example.com" would be mis-parsed as a hostname
  // after we auto-prefix https.
  const hasAnyScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  if (hasAnyScheme && !/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  // Allow users to omit scheme; default to https.
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withScheme);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    // A base URL must never smuggle credentials into plain metadata storage.
    // Queries and fragments are also rejected instead of silently discarded so
    // a pasted token cannot be mistaken for a valid Nightscout connection.
    if (url.username || url.password || url.search || url.hash) {
      return null;
    }

    if (url.protocol === 'http:' && !isLocalNightscoutHost(url.hostname)) {
      return null;
    }

    // Keep any path (some users host Nightscout under a sub-path) but trim trailing slashes.
    url.pathname = url.pathname.replace(/\/+$/, '');

    // URL() will keep '/' as pathname; turn it into empty.
    if (url.pathname === '/') {
      url.pathname = '';
    }

    // Remove default ports for nicer display.
    if (
      (url.protocol === 'https:' && url.port === '443') ||
      (url.protocol === 'http:' && url.port === '80')
    ) {
      url.port = '';
    }

    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
};

/**
 * Converts a user-provided Nightscout secret into the SHA1 hex form required for
 * authenticated requests.
 *
 * Users may paste either:
 * - the full secret/token (example: `jvA4cWn9c7zxgTyZ`), or
 * - the already-hashed value (40 hex chars).
 */
export const normalizeNightscoutApiSecretToSha1 = (
  raw: string,
): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  // Users may paste the already-hashed secret (40 hex) or the plain API_SECRET.
  if (isSha1Hex(trimmed)) {
    return trimmed.toLowerCase();
  }

  return sha1(trimmed);
};

const makeId = () =>
  `ns_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

/** Derives a user-friendly label from the Nightscout base URL (best-effort). */
export const labelFromNightscoutBaseUrl = (baseUrl: string): string => {
  try {
    const url = new URL(baseUrl);
    return url.hostname;
  } catch {
    return 'Nightscout';
  }
};

type StoredNightscoutProfile = Omit<NightscoutProfile, 'apiSecretSha1'>;
type DecodedNightscoutProfile = StoredNightscoutProfile & {
  readonly legacySecret?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const decodeStoredProfile = (
  value: unknown,
): DecodedNightscoutProfile | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const label = typeof value.label === 'string' ? value.label.trim() : '';
  const baseUrl =
    typeof value.baseUrl === 'string'
      ? normalizeNightscoutUrl(value.baseUrl)
      : null;
  const createdAt =
    typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
      ? value.createdAt
      : undefined;
  if (
    !/^[A-Za-z0-9_-]{1,96}$/.test(id) ||
    !label ||
    !baseUrl ||
    createdAt === undefined
  ) {
    return undefined;
  }
  const legacySecret =
    typeof value.apiSecretSha1 === 'string' && isSha1Hex(value.apiSecretSha1)
      ? value.apiSecretSha1.trim().toLowerCase()
      : undefined;
  return {
    id,
    label: label.slice(0, 120),
    baseUrl,
    createdAt,
    ...(legacySecret === undefined ? {} : {legacySecret}),
  };
};

const normalizedOwnerUserId = (ownerUserId: string | null): string | null => {
  const normalized = ownerUserId?.trim() ?? '';
  return normalized || null;
};

const accountScopeToken = (ownerUserId: string | null): string => {
  const normalized = normalizedOwnerUserId(ownerUserId);
  return normalized ? `u${sha1(normalized)}` : 'signed-out-local';
};

const storageKeysFor = (ownerUserId: string | null) => {
  const token = accountScopeToken(ownerUserId);
  return {
    profiles: `nightscout.profiles.v2:${token}`,
    activeProfileId: `nightscout.activeProfileId.v2:${token}`,
  };
};

const credentialService = (
  ownerUserId: string | null,
  profileId: string,
): string =>
  `shani.nightscout.v2.${accountScopeToken(ownerUserId)}.${profileId}`;

const legacyCredentialService = (profileId: string): string =>
  `shani.nightscout.${profileId}`;

const quarantinedCredentialService = (profileId: string): string =>
  `shani.nightscout.quarantine.${sha1(profileId)}`;

const metadataFor = (
  profile: StoredNightscoutProfile,
): StoredNightscoutProfile => ({
  id: profile.id,
  label: profile.label.trim().slice(0, 120) || 'Nightscout',
  baseUrl: profile.baseUrl,
  createdAt: profile.createdAt,
});

// Destructive migrations require a complete decode. A missing URL polyfill or
// damaged item must not turn a saved connection into an empty, deleted payload.
const decodeCompleteProfileList = (
  value: unknown,
): DecodedNightscoutProfile[] | undefined => {
  if (!Array.isArray(value) || value.length > MAX_PROFILES) {
    return undefined;
  }
  const profiles = value.map(decodeStoredProfile);
  if (profiles.some(profile => profile === undefined)) {
    return undefined;
  }
  return profiles as DecodedNightscoutProfile[];
};

const readLegacyQuarantine = async (): Promise<{
  profiles: StoredNightscoutProfile[];
  preferredActiveProfileId: string | null;
}> => {
  const raw = await AsyncStorage.getItem(LEGACY_QUARANTINE_KEY);
  if (raw === null) {
    return {profiles: [], preferredActiveProfileId: null};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const profiles =
      isRecord(parsed) &&
      parsed.schemaVersion === 1 &&
      parsed.reason === 'unattributed'
        ? decodeCompleteProfileList(parsed.profiles)
        : undefined;
    if (profiles && isRecord(parsed)) {
      const preferredActiveProfileId =
        typeof parsed.preferredActiveProfileId === 'string' &&
        profiles.some(profile => profile.id === parsed.preferredActiveProfileId)
          ? parsed.preferredActiveProfileId
          : null;
      return {profiles: profiles.map(metadataFor), preferredActiveProfileId};
    }
  } catch {
    // Keep the original payload for a later retry or repair.
  }
  throw new Error('Saved connections could not be read.');
};

const readStoredProfilesAt = async (
  storageKey: string,
): Promise<
  readonly (StoredNightscoutProfile & {readonly legacySecret?: string})[]
> => {
  const raw = await AsyncStorage.getItem(storageKey);
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .slice(0, MAX_PROFILES)
      .map(decodeStoredProfile)
      .filter(
        (
          profile,
        ): profile is StoredNightscoutProfile & {
          readonly legacySecret?: string;
        } => profile !== undefined,
      );
  } catch {
    return [];
  }
};

let legacyMigrationTail: Promise<void> = Promise.resolve();

const migrateOrQuarantineLegacyProfiles = async (
  ownerUserId: string | null,
): Promise<void> => {
  const normalizedOwner = normalizedOwnerUserId(ownerUserId);
  const raw = await AsyncStorage.getItem(LEGACY_PROFILES_STORAGE_KEY);
  if (raw === null) {
    await AsyncStorage.removeItem(LEGACY_ACTIVE_PROFILE_ID_KEY);
    return;
  }
  const markedOwner = (
    await AsyncStorage.getItem(LEGACY_OWNER_USER_ID_KEY)
  )?.trim();

  // A marker for another account is evidence that the legacy data is not ours.
  // Leave it in place so the owning account can migrate it later.
  if (markedOwner && markedOwner !== normalizedOwner) {
    return;
  }

  let legacyProfiles: DecodedNightscoutProfile[] | undefined;
  try {
    legacyProfiles = decodeCompleteProfileList(JSON.parse(raw));
  } catch {
    return;
  }
  if (!legacyProfiles) {
    return;
  }
  const legacyActiveId = await AsyncStorage.getItem(
    LEGACY_ACTIVE_PROFILE_ID_KEY,
  );
  const safelyAttributed =
    normalizedOwner !== null && markedOwner === normalizedOwner;
  const profilesWithSecrets = await Promise.all(
    legacyProfiles.map(async profile => ({
      ...profile,
      credential:
        profile.legacySecret ??
        (await nativeSecureCredentialStore.read(
          legacyCredentialService(profile.id),
        )) ??
        '',
    })),
  );

  if (safelyAttributed) {
    const keys = storageKeysFor(normalizedOwner);
    const existing = await readStoredProfilesAt(keys.profiles);
    const existingIds = new Set(existing.map(profile => profile.id));
    const migrated = profilesWithSecrets.filter(
      profile => !existingIds.has(profile.id),
    );
    const mergedMetadata = [
      ...existing.map(metadataFor),
      ...migrated.map(metadataFor),
    ];
    if (mergedMetadata.length > MAX_PROFILES) {
      // Leave the complete legacy payload and its credentials for a later retry
      // after the owner frees capacity. No part of this migration is written.
      return;
    }
    await Promise.all(
      migrated
        .filter(profile => isSha1Hex(profile.credential))
        .map(profile =>
          nativeSecureCredentialStore.write(
            credentialService(normalizedOwner, profile.id),
            profile.credential,
          ),
        ),
    );
    await AsyncStorage.setItem(keys.profiles, JSON.stringify(mergedMetadata));
    const existingActiveId = await AsyncStorage.getItem(keys.activeProfileId);
    const resolvedActiveId = mergedMetadata.some(
      profile => profile.id === existingActiveId,
    )
      ? existingActiveId
      : mergedMetadata.some(profile => profile.id === legacyActiveId)
      ? legacyActiveId
      : null;
    if (resolvedActiveId) {
      await AsyncStorage.setItem(keys.activeProfileId, resolvedActiveId);
    } else {
      await AsyncStorage.removeItem(keys.activeProfileId);
    }
  } else if (profilesWithSecrets.length > 0) {
    const existing = await readLegacyQuarantine();
    const merged = [...existing.profiles];
    let preferredActiveProfileId = existing.preferredActiveProfileId;
    const incoming = profilesWithSecrets.map(profile => {
      const collision = merged.find(item => item.id === profile.id);
      const id =
        collision && collision.baseUrl !== profile.baseUrl
          ? `ns_recovered_${sha1(`${profile.id}:${profile.baseUrl}`).slice(
              0,
              24,
            )}`
          : profile.id;
      const entry = {...profile, id};
      if (profile.id === legacyActiveId) {
        preferredActiveProfileId = id;
      }
      if (!merged.some(item => item.id === id)) {
        merged.push(metadataFor(entry));
      }
      return entry;
    });
    if (merged.length > MAX_PROFILES) {
      // Preserve both payloads rather than silently truncate saved connections.
      return;
    }
    await Promise.all(
      incoming
        .filter(profile => isSha1Hex(profile.credential))
        .map(profile =>
          nativeSecureCredentialStore.write(
            quarantinedCredentialService(profile.id),
            profile.credential,
          ),
        ),
    );
    await AsyncStorage.setItem(
      LEGACY_QUARANTINE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        reason: 'unattributed',
        quarantinedAt: Date.now(),
        profiles: merged,
        ...(preferredActiveProfileId ? {preferredActiveProfileId} : {}),
      }),
    );
  }

  await Promise.all(
    legacyProfiles.map(profile =>
      nativeSecureCredentialStore.remove(legacyCredentialService(profile.id)),
    ),
  );
  await Promise.all([
    AsyncStorage.removeItem(LEGACY_PROFILES_STORAGE_KEY),
    AsyncStorage.removeItem(LEGACY_ACTIVE_PROFILE_ID_KEY),
    AsyncStorage.removeItem(LEGACY_OWNER_USER_ID_KEY),
  ]);
};

const serializeLegacyOperation = <T>(
  operation: () => Promise<T>,
): Promise<T> => {
  const result = legacyMigrationTail.then(operation, operation);
  legacyMigrationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

const prepareLegacyProfiles = (ownerUserId: string | null): Promise<void> =>
  serializeLegacyOperation(() =>
    migrateOrQuarantineLegacyProfiles(ownerUserId),
  );

/** Only a count is exposed until the signed-in user explicitly requests recovery. */
export const countRecoverableLegacyNightscoutProfiles = async (
  ownerUserId: string | null,
): Promise<number> => {
  if (!normalizedOwnerUserId(ownerUserId)) {
    return 0;
  }
  return serializeLegacyOperation(async () => {
    await migrateOrQuarantineLegacyProfiles(ownerUserId);
    return (await readLegacyQuarantine()).profiles.length;
  });
};

/**
 * Call only after the user confirms that this device's old connections belong
 * to their signed-in account. Every saved credential is revalidated before any
 * profile is attributed. Failed verification leaves the quarantine intact.
 */
export const recoverLegacyNightscoutProfiles = async (params: {
  ownerUserId: string;
  verifyConnection: (profile: NightscoutProfile) => Promise<void>;
  isOwnerCurrent: () => boolean;
}): Promise<{
  profiles: NightscoutProfile[];
  activeProfileId: string | null;
}> => {
  const ownerUserId = normalizedOwnerUserId(params.ownerUserId);
  if (!ownerUserId) {
    throw new Error('Sign in before recovering saved connections.');
  }
  const assertOwnerCurrent = () => {
    if (!params.isOwnerCurrent()) {
      throw new Error(
        'The signed-in account changed before recovery completed.',
      );
    }
  };
  return serializeLegacyOperation(async () => {
    assertOwnerCurrent();
    await migrateOrQuarantineLegacyProfiles(ownerUserId);
    const quarantine = await readLegacyQuarantine();
    const quarantined = quarantine.profiles;
    const verified: NightscoutProfile[] = [];
    for (const profile of quarantined) {
      const credential = await nativeSecureCredentialStore.read(
        quarantinedCredentialService(profile.id),
      );
      assertOwnerCurrent();
      if (!credential || !isSha1Hex(credential)) {
        throw new Error(
          'The saved connection secret is unavailable. Add the connection again.',
        );
      }
      const recovered = {...profile, apiSecretSha1: credential};
      await params.verifyConnection(recovered);
      assertOwnerCurrent();
      verified.push(recovered);
    }

    const keys = storageKeysFor(ownerUserId);
    const existingRaw = await AsyncStorage.getItem(keys.profiles);
    let existing: DecodedNightscoutProfile[] | undefined;
    try {
      existing =
        existingRaw === null
          ? []
          : decodeCompleteProfileList(JSON.parse(existingRaw));
    } catch {
      // Do not overwrite unreadable account data during recovery.
    }
    if (!existing) {
      throw new Error('Current connections could not be read.');
    }
    const profiles: NightscoutProfile[] = await Promise.all(
      existing.map(async profile => ({
        ...metadataFor(profile),
        apiSecretSha1:
          profile.legacySecret ??
          (await nativeSecureCredentialStore.read(
            credentialService(ownerUserId, profile.id),
          )) ??
          '',
      })),
    );
    for (const profile of verified) {
      const sameSourceIndex = profiles.findIndex(
        item => item.baseUrl === profile.baseUrl,
      );
      if (sameSourceIndex >= 0) {
        const sameSource = profiles[sameSourceIndex]!;
        // A retry after a failed cleanup must reuse the account's existing ID.
        profiles[sameSourceIndex] = {
          ...sameSource,
          apiSecretSha1: profile.apiSecretSha1,
        };
      } else {
        const id = profiles.some(item => item.id === profile.id)
          ? makeId()
          : profile.id;
        profiles.push({...profile, id});
      }
    }
    if (profiles.length > MAX_PROFILES) {
      throw new Error(
        'There are too many saved connections to recover at once.',
      );
    }
    const existingActiveId = await AsyncStorage.getItem(keys.activeProfileId);
    // Resolve by source URL because recovery can reuse an existing ID or rename
    // a colliding one while retaining the user's original active connection.
    const preferredSource = quarantined.find(
      profile => profile.id === quarantine.preferredActiveProfileId,
    );
    const preferredActiveId = profiles.find(
      profile => profile.baseUrl === preferredSource?.baseUrl,
    )?.id;
    const activeProfileId = existing.some(
      profile => profile.id === existingActiveId,
    )
      ? existingActiveId
      : preferredActiveId ?? profiles[0]?.id ?? null;
    assertOwnerCurrent();
    if (verified.length === 0) {
      return {profiles, activeProfileId};
    }
    for (const profile of profiles) {
      assertOwnerCurrent();
      await nativeSecureCredentialStore.write(
        credentialService(ownerUserId, profile.id),
        profile.apiSecretSha1,
      );
    }
    assertOwnerCurrent();
    await AsyncStorage.setItem(
      keys.profiles,
      JSON.stringify(profiles.map(metadataFor)),
    );
    assertOwnerCurrent();
    if (activeProfileId) {
      await AsyncStorage.setItem(keys.activeProfileId, activeProfileId);
    }
    assertOwnerCurrent();
    // Remove the index first: an interrupted cleanup can never leave an entry
    // whose only credential has already been deleted. Repeating recovery is safe.
    await AsyncStorage.removeItem(LEGACY_QUARANTINE_KEY);
    await Promise.all(
      quarantined.map(profile =>
        nativeSecureCredentialStore.remove(
          quarantinedCredentialService(profile.id),
        ),
      ),
    ).catch(() => {
      // Account data is durable and the quarantine index is gone. An unused
      // Keychain item must not report a failed restore or hide the new profile.
    });
    return {profiles, activeProfileId};
  });
};

const readStoredProfiles = async (
  ownerUserId: string | null,
): Promise<
  readonly (StoredNightscoutProfile & {readonly legacySecret?: string})[]
> => {
  await prepareLegacyProfiles(ownerUserId);
  return readStoredProfilesAt(storageKeysFor(ownerUserId).profiles);
};

/** Loads profile metadata from AsyncStorage and credentials from Keychain/Keystore. */
export const loadNightscoutProfiles = async (
  ownerUserId: string | null = null,
): Promise<{
  profiles: NightscoutProfile[];
  activeProfileId: string | null;
}> => {
  const keys = storageKeysFor(ownerUserId);
  const [storedProfiles, activeId] = await Promise.all([
    readStoredProfiles(ownerUserId),
    AsyncStorage.getItem(keys.activeProfileId),
  ]);
  const profiles = await Promise.all(
    storedProfiles.map(async profile => {
      const apiSecretSha1 =
        profile.legacySecret ??
        (await nativeSecureCredentialStore.read(
          credentialService(ownerUserId, profile.id),
        )) ??
        '';
      if (profile.legacySecret !== undefined) {
        await nativeSecureCredentialStore.write(
          credentialService(ownerUserId, profile.id),
          profile.legacySecret,
        );
      }
      return {
        id: profile.id,
        label: profile.label,
        baseUrl: profile.baseUrl,
        createdAt: profile.createdAt,
        apiSecretSha1,
      };
    }),
  );
  if (storedProfiles.some(profile => profile.legacySecret !== undefined)) {
    await AsyncStorage.setItem(
      keys.profiles,
      JSON.stringify(profiles.map(metadataFor)),
    );
  }
  const validActiveId = profiles.some(profile => profile.id === activeId)
    ? activeId
    : null;

  return {
    profiles,
    activeProfileId: validActiveId,
  };
};

/** Persists only metadata to AsyncStorage; credentials stay in Keychain/Keystore. */
export const persistNightscoutProfiles = async (
  profiles: NightscoutProfile[],
  activeProfileId: string | null,
  ownerUserId: string | null = null,
) => {
  const keys = storageKeysFor(ownerUserId);
  const previous = await readStoredProfiles(ownerUserId);
  const boundedProfiles = profiles.slice(0, MAX_PROFILES);
  await Promise.all(
    boundedProfiles.map(profile =>
      nativeSecureCredentialStore.write(
        credentialService(ownerUserId, profile.id),
        profile.apiSecretSha1,
      ),
    ),
  );
  await AsyncStorage.setItem(
    keys.profiles,
    JSON.stringify(boundedProfiles.map(metadataFor)),
  );
  const retainedIds = new Set(boundedProfiles.map(profile => profile.id));
  await Promise.all(
    previous
      .filter(profile => !retainedIds.has(profile.id))
      .map(profile =>
        nativeSecureCredentialStore.remove(
          credentialService(ownerUserId, profile.id),
        ),
      ),
  );
  if (activeProfileId) {
    await AsyncStorage.setItem(keys.activeProfileId, activeProfileId);
  } else {
    await AsyncStorage.removeItem(keys.activeProfileId);
  }
};

/** Returns true when at least one profile exists in storage. */
export const hasAnyNightscoutProfile = async (
  ownerUserId: string | null = null,
): Promise<boolean> => {
  const stored = await readStoredProfiles(ownerUserId);
  return stored.length > 0;
};

/** Creates an in-memory profile object (does not persist). */
export const createNightscoutProfile = (params: {
  baseUrl: string;
  apiSecretSha1: string;
  label?: string;
}): NightscoutProfile => {
  const {baseUrl, apiSecretSha1} = params;
  const createdAt = Date.now();
  return {
    id: makeId(),
    label: params.label?.trim()
      ? params.label.trim()
      : labelFromNightscoutBaseUrl(baseUrl),
    baseUrl,
    apiSecretSha1,
    createdAt,
  };
};

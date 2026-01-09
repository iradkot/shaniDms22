import AsyncStorage from '@react-native-async-storage/async-storage';
import {sha1} from 'js-sha1';

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

const PROFILES_STORAGE_KEY = 'nightscout.profiles.v1';
const ACTIVE_PROFILE_ID_KEY = 'nightscout.activeProfileId.v1';

const isSha1Hex = (value: string): boolean => /^[a-f0-9]{40}$/i.test(value.trim());

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
  if (!trimmed) return null;

  // If the user provided a scheme, only allow http(s).
  // Without this, inputs like "ftp://example.com" would be mis-parsed as a hostname
  // after we auto-prefix https.
  const hasAnyScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  if (hasAnyScheme && !/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  // Allow users to omit scheme; default to https.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withScheme);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    // Normalize: remove trailing slashes from the *path* and drop default ports.
    url.hash = '';
    url.search = '';

    // Keep any path (some users host Nightscout under a sub-path) but trim trailing slashes.
    url.pathname = url.pathname.replace(/\/+$/, '');

    // URL() will keep '/' as pathname; turn it into empty.
    if (url.pathname === '/') {
      url.pathname = '';
    }

    // Remove default ports for nicer display.
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
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
export const normalizeNightscoutApiSecretToSha1 = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Users may paste the already-hashed secret (40 hex) or the plain API_SECRET.
  if (isSha1Hex(trimmed)) {
    return trimmed.toLowerCase();
  }

  return sha1(trimmed);
};

const makeId = () => `ns_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const labelFromBaseUrl = (baseUrl: string) => {
  try {
    const url = new URL(baseUrl);
    return url.hostname;
  } catch {
    return 'Nightscout';
  }
};

/** Loads profiles + selected profile ID from AsyncStorage. */
export const loadNightscoutProfiles = async (): Promise<{
  profiles: NightscoutProfile[];
  activeProfileId: string | null;
}> => {
  const [profilesRaw, activeId] = await Promise.all([
    AsyncStorage.getItem(PROFILES_STORAGE_KEY),
    AsyncStorage.getItem(ACTIVE_PROFILE_ID_KEY),
  ]);

  let profiles: NightscoutProfile[] = [];
  if (profilesRaw) {
    try {
      const parsed = JSON.parse(profilesRaw);
      if (Array.isArray(parsed)) {
        profiles = parsed;
      }
    } catch {
      profiles = [];
    }
  }

  return {
    profiles,
    activeProfileId: activeId ?? null,
  };
};

/** Persists profiles + selected profile ID to AsyncStorage. */
export const persistNightscoutProfiles = async (
  profiles: NightscoutProfile[],
  activeProfileId: string | null,
) => {
  await AsyncStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
  if (activeProfileId) {
    await AsyncStorage.setItem(ACTIVE_PROFILE_ID_KEY, activeProfileId);
  } else {
    await AsyncStorage.removeItem(ACTIVE_PROFILE_ID_KEY);
  }
};

/** Returns true when at least one profile exists in storage. */
export const hasAnyNightscoutProfile = async (): Promise<boolean> => {
  const raw = await AsyncStorage.getItem(PROFILES_STORAGE_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
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
    label: params.label?.trim() ? params.label.trim() : labelFromBaseUrl(baseUrl),
    baseUrl,
    apiSecretSha1,
    createdAt,
  };
};

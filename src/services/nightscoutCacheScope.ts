import {sha1} from 'js-sha1';

import {
  getNightscoutBaseUrl,
  getNightscoutOwnerUserId,
} from 'app/api/shaniNightscoutInstances';
import {canonicalizeNightscoutBaseUrl} from 'app/modules/workspaces';

const CACHE_KEY_PREFIX = 'nightscout-cache.v1';
/**
 * Opaque identity used to isolate cached Nightscout health data.
 *
 * It is derived only from the canonical Nightscout Source URL. Credentials are
 * deliberately excluded, and the URL itself is never written into a key.
 */
export interface NightscoutCacheScope {
  readonly sourceIdentity: string;
}

export const createNightscoutCacheScope = (
  baseUrl: string | null | undefined,
  ownerUserId: string | null = getNightscoutOwnerUserId(),
): NightscoutCacheScope | null => {
  if (!baseUrl) return null;
  const canonicalUrl = canonicalizeNightscoutBaseUrl(baseUrl);
  if (!canonicalUrl) return null;
  return {
    sourceIdentity: sha1(
      `nightscout-cache-source:v2\n${
        ownerUserId?.trim() || 'signed-out-local'
      }\n${canonicalUrl}`,
    ),
  };
};

export const getActiveNightscoutCacheScope = (): NightscoutCacheScope | null =>
  createNightscoutCacheScope(
    getNightscoutBaseUrl(),
    getNightscoutOwnerUserId(),
  );

export const nightscoutCacheKey = (
  scope: NightscoutCacheScope,
  resourceIdentity: string,
): string =>
  `${CACHE_KEY_PREFIX}:${scope.sourceIdentity}:${resourceIdentity}`;

export const isNightscoutCacheKeyForResource = (
  key: string,
  resourcePrefix: string,
): boolean =>
  key.startsWith(`${CACHE_KEY_PREFIX}:`) &&
  key.includes(`:${resourcePrefix}`);

export const isSameNightscoutCacheScope = (
  left: NightscoutCacheScope | null,
  right: NightscoutCacheScope | null,
): boolean => left?.sourceIdentity === right?.sourceIdentity;

export const assertActiveNightscoutCacheScope = (
  expected: NightscoutCacheScope,
  message: string = 'Nightscout Source changed while loading cached data',
): void => {
  if (!isSameNightscoutCacheScope(expected, getActiveNightscoutCacheScope())) {
    throw new Error(message);
  }
};

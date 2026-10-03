import {sha1} from 'js-sha1';

import {
  getNightscoutBaseUrl,
  getNightscoutOwnerUserId,
} from 'app/api/shaniNightscoutInstances';
import {canonicalizeNightscoutBaseUrl} from 'app/modules/workspaces';

const CACHE_KEY_PREFIX = 'nightscout-cache.v1';
const deletedCacheSources = new Set<string>();
const cacheWriteTails = new Map<string, Promise<void>>();

/** Deletion drains earlier writes and denies writes arriving from older async readers. */
export const withNightscoutCacheWrite = <T>(
  scope: NightscoutCacheScope,
  operation: () => Promise<T>,
): Promise<T> => {
  const run = (
    cacheWriteTails.get(scope.sourceIdentity) ?? Promise.resolve()
  ).then(() => {
    if (deletedCacheSources.has(scope.sourceIdentity)) {
      throw new Error('Account deletion is in progress.');
    }
    return operation();
  });
  cacheWriteTails.set(
    scope.sourceIdentity,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
};

export const isNightscoutCacheSourceDeleted = (
  sourceIdentity: string,
): boolean => deletedCacheSources.has(sourceIdentity);

export const blockAndDrainNightscoutCacheWrites = async (
  sourceIdentities: readonly string[],
): Promise<void> => {
  sourceIdentities.forEach(sourceIdentity =>
    deletedCacheSources.add(sourceIdentity),
  );
  await Promise.all(
    sourceIdentities.map(sourceIdentity => cacheWriteTails.get(sourceIdentity)),
  );
};
/**
 * Opaque identity used to isolate cached Nightscout health data.
 *
 * It is derived from the owning account and canonical Nightscout Source URL.
 * Credentials are excluded, and the URL itself is never written into a key.
 */
export interface NightscoutCacheScope {
  readonly sourceIdentity: string;
}

export const createNightscoutCacheScope = (
  baseUrl: string | null | undefined,
  ownerUserId: string | null = getNightscoutOwnerUserId(),
): NightscoutCacheScope | null => {
  if (!baseUrl) {
    return null;
  }
  const canonicalUrl = canonicalizeNightscoutBaseUrl(baseUrl);
  if (!canonicalUrl) {
    return null;
  }
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
): string => `${CACHE_KEY_PREFIX}:${scope.sourceIdentity}:${resourceIdentity}`;

export const isNightscoutCacheKeyForResource = (
  key: string,
  resourcePrefix: string,
): boolean =>
  key.startsWith(`${CACHE_KEY_PREFIX}:`) && key.includes(`:${resourcePrefix}`);

export const isSameNightscoutCacheScope = (
  left: NightscoutCacheScope | null,
  right: NightscoutCacheScope | null,
): boolean => left?.sourceIdentity === right?.sourceIdentity;

export const assertActiveNightscoutCacheScope = (
  expected: NightscoutCacheScope,
  message: string = 'Nightscout Source changed while loading cached data',
): void => {
  if (isNightscoutCacheSourceDeleted(expected.sourceIdentity)) {
    throw new Error('Account deletion is in progress.');
  }
  if (!isSameNightscoutCacheScope(expected, getActiveNightscoutCacheScope())) {
    throw new Error(message);
  }
};

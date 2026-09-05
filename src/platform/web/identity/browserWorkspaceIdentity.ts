import type {JournalWorkspaceScope} from '../../../modules/journal';
import {
  parseNightscoutSourceId,
  parseProductUserId,
  parseWorkspaceId,
} from '../../../modules/journal';

const IDENTITY_STORAGE_KEY = 'shani.web.local-workspace.v1';

export interface BrowserSynchronousStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredBrowserWorkspaceIdentity {
  readonly schemaVersion: 1;
  readonly localId: string;
}

const validLocalId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9-]{8,128}$/.test(value);

const decodeIdentity = (
  raw: string | null,
): StoredBrowserWorkspaceIdentity | undefined => {
  if (raw === null) {
    return undefined;
  }
  try {
    const value = JSON.parse(raw) as unknown;
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      'schemaVersion' in value &&
      'localId' in value &&
      value.schemaVersion === 1 &&
      validLocalId(value.localId)
    ) {
      return {schemaVersion: 1, localId: value.localId};
    }
  } catch {
    // A corrupt identity is replaced with a new opaque local scope.
  }
  return undefined;
};

const requiredIdentifier = <T extends string>(
  result:
    | {readonly ok: true; readonly value: T}
    | {readonly ok: false; readonly issues: readonly unknown[]},
): T => {
  if (!result.ok) {
    throw new Error('The browser Workspace identity is invalid.');
  }
  return result.value;
};

/**
 * Creates an opaque device-local identity until Google/Firebase web auth is
 * configured. It contains no email, Nightscout URL, or medical information.
 */
export const getOrCreateBrowserWorkspaceScope = (
  storage: BrowserSynchronousStorage,
  createId: () => string,
): JournalWorkspaceScope => {
  const stored = decodeIdentity(storage.getItem(IDENTITY_STORAGE_KEY));
  const localId = stored?.localId ?? createId();
  if (!validLocalId(localId)) {
    throw new Error('The generated browser identity is invalid.');
  }
  if (stored === undefined) {
    storage.setItem(
      IDENTITY_STORAGE_KEY,
      JSON.stringify({schemaVersion: 1, localId}),
    );
  }

  return {
    productUserId: requiredIdentifier(
      parseProductUserId(`web-user-${localId}`),
    ),
    workspaceId: requiredIdentifier(parseWorkspaceId(`web-${localId}`)),
    nightscoutSourceId: requiredIdentifier(
      parseNightscoutSourceId('web-nightscout-unconfigured'),
    ),
  };
};

export const createOpaqueBrowserId = (): string => {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid !== undefined) {
    return randomUuid;
  }
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}-${Math.random().toString(36).slice(2)}`;
};

export const createAuthenticatedBrowserWorkspaceScope = (input: {
  readonly uid: string;
  readonly workspaceId?: string;
  readonly nightscoutSourceId: string;
}): JournalWorkspaceScope => ({
  productUserId: requiredIdentifier(parseProductUserId(input.uid)),
  workspaceId: requiredIdentifier(
    parseWorkspaceId(input.workspaceId ?? 'workspace_unconfigured'),
  ),
  nightscoutSourceId: requiredIdentifier(
    parseNightscoutSourceId(input.nightscoutSourceId),
  ),
});

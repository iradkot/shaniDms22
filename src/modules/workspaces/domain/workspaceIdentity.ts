import {
  parseNightscoutSourceId,
  parseProductUserId,
  parseWorkspaceId,
} from '../../journal';
import type {
  JournalWorkspaceScope,
  NightscoutSourceId,
  ProductUserId,
  WorkspaceId,
} from '../../journal';

export interface WorkspaceIdentityDigest {
  digest(value: string): string;
}

export interface WorkspaceIdentity {
  readonly scope: JournalWorkspaceScope;
  readonly canonicalNightscoutUrl: string;
}

export type WorkspaceIdentityResult =
  | {readonly ok: true; readonly value: WorkspaceIdentity}
  | {readonly ok: false; readonly reason: string};

/**
 * Canonical connection identity only. Query strings, fragments, credentials,
 * and API secrets never participate in Workspace identity.
 */
export const canonicalizeNightscoutBaseUrl = (
  untrustedUrl: string,
): string | undefined => {
  const trimmed = untrustedUrl.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      return undefined;
    }
    parsed.hash = '';
    parsed.search = '';
    parsed.hostname = parsed.hostname.toLocaleLowerCase('en-US');
    if (
      (parsed.protocol === 'https:' && parsed.port === '443') ||
      (parsed.protocol === 'http:' && parsed.port === '80')
    ) {
      parsed.port = '';
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    if (parsed.pathname === '/') {
      parsed.pathname = '';
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return undefined;
  }
};

const safeDigest = (
  digest: WorkspaceIdentityDigest,
  value: string,
): string | undefined => {
  const output = digest.digest(value).trim().toLocaleLowerCase('en-US');
  return /^[a-z0-9_-]{20,128}$/.test(output) ? output : undefined;
};

const valueOf = <T extends string>(
  parsed: {readonly ok: true; readonly value: T} | {readonly ok: false},
): T | undefined => (parsed.ok ? parsed.value : undefined);

export const deriveWorkspaceIdentity = (
  input: {
    readonly firebaseUserId: string;
    readonly nightscoutBaseUrl: string;
  },
  digest: WorkspaceIdentityDigest,
): WorkspaceIdentityResult => {
  const productUserId = valueOf<ProductUserId>(
    parseProductUserId(input.firebaseUserId),
  );
  if (productUserId === undefined) {
    return {ok: false, reason: 'Firebase User ID is invalid.'};
  }
  const canonicalNightscoutUrl = canonicalizeNightscoutBaseUrl(
    input.nightscoutBaseUrl,
  );
  if (canonicalNightscoutUrl === undefined) {
    return {ok: false, reason: 'Nightscout URL is invalid.'};
  }
  const workspaceDigest = safeDigest(
    digest,
    `shani-workspace:v1\n${productUserId}\n${canonicalNightscoutUrl}`,
  );
  const sourceDigest = safeDigest(
    digest,
    `nightscout-source:v1\n${canonicalNightscoutUrl}`,
  );
  if (workspaceDigest === undefined || sourceDigest === undefined) {
    return {ok: false, reason: 'Workspace digest is invalid.'};
  }
  const workspaceId = valueOf<WorkspaceId>(
    parseWorkspaceId(`workspace_${workspaceDigest.slice(0, 40)}`),
  );
  const nightscoutSourceId = valueOf<NightscoutSourceId>(
    parseNightscoutSourceId(`nightscout_${sourceDigest.slice(0, 40)}`),
  );
  if (workspaceId === undefined || nightscoutSourceId === undefined) {
    return {ok: false, reason: 'Derived Workspace identity is invalid.'};
  }
  return {
    ok: true,
    value: {
      canonicalNightscoutUrl,
      scope: {productUserId, workspaceId, nightscoutSourceId},
    },
  };
};

import {createHash} from 'node:crypto';

import type {EncryptedEnvelope, EnvelopeCipher} from './vault';

export interface NightscoutCredential {
  readonly url: string;
  /** Usable SHA1 credential sent as the Nightscout `api-secret` header. */
  readonly apiSecretSha1: string;
}

export interface NightscoutVaultDocument {
  readonly version: 1;
  readonly kind: 'nightscout';
  readonly envelope: EncryptedEnvelope;
  readonly updatedAtIso: string;
}

export interface NightscoutVaultRepository {
  read(uid: string): Promise<NightscoutVaultDocument | null>;
  write(uid: string, document: NightscoutVaultDocument): Promise<void>;
  remove(uid: string): Promise<void>;
}

export interface NightscoutCredentialVault {
  has(uid: string): Promise<boolean>;
  put(uid: string, credential: NightscoutCredential): Promise<void>;
  get(uid: string): Promise<NightscoutCredential | null>;
  remove(uid: string): Promise<void>;
}

const associatedData = (uid: string): string =>
  `shanidms:v1:${uid}:nightscout`;

const isSha1Hex = (value: string): boolean => /^[a-f0-9]{40}$/i.test(value);

export const normalizeNightscoutApiSecret = (value: string): string => {
  const trimmed = value.trim();
  return isSha1Hex(trimmed)
    ? trimmed.toLowerCase()
    : createHash('sha1').update(trimmed, 'utf8').digest('hex');
};

/**
 * Canonical identity contract shared with the native Product core. The vault
 * keeps its stricter connection validator, while identity intentionally drops
 * the harmless trailing slash that URL() adds to a root or sub-path.
 */
export const canonicalizeNightscoutIdentityUrl = (url: string): string => {
  const parsed = new URL(url.trim());
  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('Invalid Nightscout identity URL');
  }
  parsed.hostname = parsed.hostname.toLowerCase();
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
};

const identityDigest = (namespace: string, value: string): string =>
  createHash('sha1')
    .update(`${namespace}:v1\n${value}`, 'utf8')
    .digest('hex');

/** Stable for one Nightscout source across the Product User's devices. */
export const createNightscoutSourceId = (url: string): string => {
  const canonicalUrl = canonicalizeNightscoutIdentityUrl(url);
  return `nightscout_${identityDigest('nightscout-source', canonicalUrl)}`;
};

/** Stable account + source Workspace identity used by native and web. */
export const createNightscoutWorkspaceId = (
  uid: string,
  url: string,
): string => {
  const canonicalUrl = canonicalizeNightscoutIdentityUrl(url);
  return `workspace_${identityDigest(
    'shani-workspace',
    `${uid}\n${canonicalUrl}`,
  )}`;
};

const decodeCredential = (plaintext: string): NightscoutCredential => {
  let value: unknown;
  try {
    value = JSON.parse(plaintext);
  } catch {
    throw new Error('Invalid encrypted Nightscout credential');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid encrypted Nightscout credential');
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some(key => !['url', 'apiSecretSha1'].includes(key)) ||
    typeof record.url !== 'string' ||
    record.url.length === 0 ||
    record.url.length > 2_048 ||
    typeof record.apiSecretSha1 !== 'string' ||
    !isSha1Hex(record.apiSecretSha1)
  ) {
    throw new Error('Invalid encrypted Nightscout credential');
  }
  return {
    url: record.url,
    apiSecretSha1: record.apiSecretSha1.toLowerCase(),
  };
};

export class EncryptedNightscoutCredentialVault
  implements NightscoutCredentialVault
{
  constructor(
    private readonly repository: NightscoutVaultRepository,
    private readonly cipher: EnvelopeCipher,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async has(uid: string): Promise<boolean> {
    return (await this.repository.read(uid)) !== null;
  }

  async put(uid: string, credential: NightscoutCredential): Promise<void> {
    const plaintext = JSON.stringify(credential);
    const envelope = await this.cipher.encrypt(plaintext, associatedData(uid));
    await this.repository.write(uid, {
      version: 1,
      kind: 'nightscout',
      envelope,
      updatedAtIso: this.now().toISOString(),
    });
  }

  async get(uid: string): Promise<NightscoutCredential | null> {
    const document = await this.repository.read(uid);
    if (document === null) return null;
    if (document.version !== 1 || document.kind !== 'nightscout') {
      throw new Error('Invalid Nightscout vault document');
    }
    return decodeCredential(
      await this.cipher.decrypt(document.envelope, associatedData(uid)),
    );
  }

  remove(uid: string): Promise<void> {
    return this.repository.remove(uid);
  }
}

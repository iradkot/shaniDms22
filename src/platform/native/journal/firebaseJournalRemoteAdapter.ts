import {
  buildJournalFirestoreCollectionPaths,
  buildJournalFirestorePaths,
  decodeRemoteJournalChange,
  evaluateJournalFirestoreScope,
  journalRemoteError,
  journalRemoteOk,
} from '../../../modules/journal/sync';
import type {
  JournalRemoteAdapter,
  JournalRemoteFailure,
  JournalRemotePullResponse,
  JournalRemotePushResponse,
  RemoteJournalChange,
} from '../../../modules/journal/sync';
import type {JournalWorkspaceScope} from '../../../modules/journal';

export interface JournalFirestoreCommitTime {
  readonly seconds: number;
  readonly nanoseconds: number;
}

export interface JournalFirestoreCursor {
  readonly committedAt: JournalFirestoreCommitTime;
  readonly operationId: string;
}

export type JournalFirestoreDocumentSnapshot =
  | {readonly exists: false}
  | {readonly exists: true; readonly data: unknown};

export interface JournalFirestoreTransaction {
  get(documentPath: string): Promise<JournalFirestoreDocumentSnapshot>;
  set(documentPath: string, value: Readonly<Record<string, unknown>>): void;
  /** Returns the Firestore SDK's server-timestamp sentinel. */
  serverTimestamp(): unknown;
}

export interface JournalFirestoreOperationRecord {
  readonly operationId: string;
  readonly committedAt: JournalFirestoreCommitTime;
  readonly data: unknown;
}

/**
 * Narrow native SDK boundary. Journal sync owns validation, idempotency, paths,
 * and cursors; this gateway owns only atomic Firestore I/O.
 */
export interface JournalFirestoreGateway {
  runTransaction<T>(
    operation: (transaction: JournalFirestoreTransaction) => Promise<T>,
  ): Promise<T>;
  listOperations(input: {
    readonly collectionPath: string;
    readonly after?: JournalFirestoreCursor;
    readonly entryId?: string;
  }): Promise<readonly JournalFirestoreOperationRecord[]>;
}

export interface FirebaseJournalRemoteAdapterDependencies {
  readonly gateway: JournalFirestoreGateway;
  readonly authenticatedUid: () => string | null;
}

type PushTransactionResult =
  | {readonly kind: 'acknowledged'}
  | {readonly kind: 'conflict'; readonly remoteChange: unknown}
  | {readonly kind: 'rejected'; readonly message: string};

interface StoredOperation {
  readonly kind: 'full';
  readonly entryId: string;
  readonly change: RemoteJournalChange;
}

interface StoredCompactedOperation {
  readonly kind: 'compacted';
  readonly entryId: string;
  readonly compactedChange: {
    readonly schemaVersion: 1;
    readonly operationId: string;
    readonly changeKind: 'upsert';
    readonly baseRevision: number | null;
    readonly localRevision: number;
    readonly changedFields: readonly string[];
    readonly contentDigest: string;
  };
}

type DecodedStoredOperation = StoredOperation | StoredCompactedOperation;

interface StoredEntryHead {
  readonly schemaVersion: 1;
  readonly entityId: string;
  readonly operationId: string;
  readonly localRevision: number;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSafeDocumentId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

const sortedJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortedJsonValue);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = sortedJsonValue(value[key]);
      return result;
    }, {});
};

const canonicalJson = (value: unknown): string =>
  JSON.stringify(sortedJsonValue(value));

/* eslint-disable no-bitwise -- SHA-256 is defined in terms of 32-bit bitwise operations. */
const utf8Bytes = (value: string): number[] => {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.charCodeAt(index);
    if (
      codePoint >= 0xd800 &&
      codePoint <= 0xdbff &&
      index + 1 < value.length
    ) {
      const trailing = value.charCodeAt(index + 1);
      if (trailing >= 0xdc00 && trailing <= 0xdfff) {
        codePoint =
          0x10000 + ((codePoint - 0xd800) << 10) + (trailing - 0xdc00);
        index += 1;
      }
    }
    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >>> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >>> 12),
        0x80 | ((codePoint >>> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >>> 18),
        0x80 | ((codePoint >>> 12) & 0x3f),
        0x80 | ((codePoint >>> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return bytes;
};

const rotateRight = (value: number, count: number): number =>
  (value >>> count) | (value << (32 - count));

const sha256 = (value: string): string => {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
    0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
    0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
    0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
    0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
    0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
    0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
    0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
    0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const words = utf8Bytes(value);
  const bitLength = words.length * 8;
  words.push(0x80);
  while (words.length % 64 !== 56) {
    words.push(0);
  }
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) {
    words.push((high >>> shift) & 0xff);
  }
  for (let shift = 24; shift >= 0; shift -= 8) {
    words.push((low >>> shift) & 0xff);
  }
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f,
    0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  for (let offset = 0; offset < words.length; offset += 64) {
    const schedule = new Array<number>(64).fill(0);
    for (let index = 0; index < 16; index += 1) {
      const start = offset + index * 4;
      schedule[index] =
        ((words[start]! << 24) |
          (words[start + 1]! << 16) |
          (words[start + 2]! << 8) |
          words[start + 3]!) >>>
        0;
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = schedule[index - 15]!;
      const previous2 = schedule[index - 2]!;
      const sigma0 =
        rotateRight(previous15, 7) ^
        rotateRight(previous15, 18) ^
        (previous15 >>> 3);
      const sigma1 =
        rotateRight(previous2, 17) ^
        rotateRight(previous2, 19) ^
        (previous2 >>> 10);
      schedule[index] =
        (schedule[index - 16]! +
          sigma0 +
          schedule[index - 7]! +
          sigma1) >>>
        0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 =
        rotateRight(e!, 6) ^ rotateRight(e!, 11) ^ rotateRight(e!, 25);
      const choice = (e! & f!) ^ (~e! & g!);
      const first = (h! + sum1 + choice + constants[index]! + schedule[index]!) >>> 0;
      const sum0 =
        rotateRight(a!, 2) ^ rotateRight(a!, 13) ^ rotateRight(a!, 22);
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const second = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d! + first) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (first + second) >>> 0;
    }
    hash[0] = (hash[0]! + a!) >>> 0;
    hash[1] = (hash[1]! + b!) >>> 0;
    hash[2] = (hash[2]! + c!) >>> 0;
    hash[3] = (hash[3]! + d!) >>> 0;
    hash[4] = (hash[4]! + e!) >>> 0;
    hash[5] = (hash[5]! + f!) >>> 0;
    hash[6] = (hash[6]! + g!) >>> 0;
    hash[7] = (hash[7]! + h!) >>> 0;
  }
  return hash.map(word => word.toString(16).padStart(8, '0')).join('');
};
/* eslint-enable no-bitwise */

const changeDigest = (change: RemoteJournalChange): string =>
  sha256(canonicalJson(change));

const changeScope = (change: RemoteJournalChange) =>
  change.changeKind === 'upsert' ? change.document.scope : change.scope;

const changeEntityId = (change: RemoteJournalChange): string =>
  change.changeKind === 'upsert'
    ? change.document.entityId
    : change.tombstone.entityId;

const scopeMatches = (
  remote: ReturnType<typeof changeScope>,
  local: JournalWorkspaceScope,
): boolean =>
  remote.ownerProductUserId === local.productUserId &&
  remote.workspaceId === local.workspaceId &&
  remote.nightscoutSourceId === local.nightscoutSourceId;

const permissionFailure = (): JournalRemoteFailure => ({
  code: 'permission_denied',
  message: 'The signed-in user cannot access this Journal Workspace.',
  retryable: false,
});

const rejectedFailure = (message: string): JournalRemoteFailure => ({
  code: 'remote_rejected',
  message,
  retryable: false,
});

const errorCode = (error: unknown): string | undefined => {
  if (!isRecord(error)) {
    return undefined;
  }
  const code = error.code;
  return typeof code === 'string' ? code.toLocaleLowerCase() : undefined;
};

const mapFirestoreFailure = (error: unknown): JournalRemoteFailure => {
  const code = errorCode(error) ?? '';
  if (
    code.includes('unavailable') ||
    code.includes('deadline-exceeded') ||
    code.includes('network-request-failed') ||
    code.includes('cancelled')
  ) {
    return {
      code: 'offline',
      message: 'Journal cloud sync is temporarily unavailable.',
      retryable: true,
    };
  }
  if (code.includes('permission-denied') || code.includes('unauthenticated')) {
    return permissionFailure();
  }
  return {
    code: 'unknown',
    message: 'Journal cloud sync failed unexpectedly.',
    retryable: true,
  };
};

const decodeStoredOperation = (
  value: unknown,
  expectedOperationId: string,
): DecodedStoredOperation | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const keys = Object.keys(value).sort();
  if (typeof value.entryId !== 'string') {
    return undefined;
  }
  if (
    keys.length === 3 &&
    keys[0] === 'change' &&
    keys[1] === 'committedAt' &&
    keys[2] === 'entryId'
  ) {
    const decoded = decodeRemoteJournalChange(value.change);
    if (
      !decoded.ok ||
      decoded.value.operationId !== expectedOperationId ||
      changeEntityId(decoded.value) !== value.entryId
    ) {
      return undefined;
    }
    return {kind: 'full', entryId: value.entryId, change: decoded.value};
  }
  if (
    keys.length !== 3 ||
    keys[0] !== 'committedAt' ||
    keys[1] !== 'compactedChange' ||
    keys[2] !== 'entryId' ||
    !isRecord(value.compactedChange)
  ) {
    return undefined;
  }
  const compacted = value.compactedChange;
  const compactedKeys = Object.keys(compacted).sort();
  if (
    compactedKeys.length !== 7 ||
    compactedKeys[0] !== 'baseRevision' ||
    compactedKeys[1] !== 'changeKind' ||
    compactedKeys[2] !== 'changedFields' ||
    compactedKeys[3] !== 'contentDigest' ||
    compactedKeys[4] !== 'localRevision' ||
    compactedKeys[5] !== 'operationId' ||
    compactedKeys[6] !== 'schemaVersion' ||
    compacted.schemaVersion !== 1 ||
    compacted.operationId !== expectedOperationId ||
    compacted.changeKind !== 'upsert' ||
    (compacted.baseRevision !== null &&
      (!Number.isSafeInteger(compacted.baseRevision) ||
        (compacted.baseRevision as number) <= 0)) ||
    !Number.isSafeInteger(compacted.localRevision) ||
    (compacted.localRevision as number) <= 0 ||
    (compacted.baseRevision !== null &&
      (compacted.baseRevision as number) >=
        (compacted.localRevision as number)) ||
    !Array.isArray(compacted.changedFields) ||
    compacted.changedFields.length === 0 ||
    compacted.changedFields.length > 10 ||
    compacted.changedFields.some(field => typeof field !== 'string') ||
    typeof compacted.contentDigest !== 'string' ||
    !/^[0-9a-f]{64}$/.test(compacted.contentDigest)
  ) {
    return undefined;
  }
  return {
    kind: 'compacted',
    entryId: value.entryId,
    compactedChange: {
      schemaVersion: 1,
      operationId: expectedOperationId,
      changeKind: 'upsert',
      baseRevision: compacted.baseRevision as number | null,
      localRevision: compacted.localRevision as number,
      changedFields: compacted.changedFields as readonly string[],
      contentDigest: compacted.contentDigest,
    },
  };
};

const decodeStoredEntryHead = (
  value: unknown,
  expectedEntityId: string,
): StoredEntryHead | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 4 ||
    keys[0] !== 'entityId' ||
    keys[1] !== 'localRevision' ||
    keys[2] !== 'operationId' ||
    keys[3] !== 'schemaVersion' ||
    value.schemaVersion !== 1 ||
    value.entityId !== expectedEntityId ||
    !isSafeDocumentId(value.operationId) ||
    !Number.isSafeInteger(value.localRevision) ||
    (value.localRevision as number) <= 0
  ) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    entityId: expectedEntityId,
    operationId: value.operationId,
    localRevision: value.localRevision as number,
  };
};

const validCommitTime = (value: unknown): value is JournalFirestoreCommitTime =>
  isRecord(value) &&
  Number.isSafeInteger(value.seconds) &&
  (value.seconds as number) >= 0 &&
  Number.isSafeInteger(value.nanoseconds) &&
  (value.nanoseconds as number) >= 0 &&
  (value.nanoseconds as number) < 1_000_000_000;

const compareCursor = (
  left: JournalFirestoreCursor,
  right: JournalFirestoreCursor,
): number => {
  if (left.committedAt.seconds !== right.committedAt.seconds) {
    return left.committedAt.seconds - right.committedAt.seconds;
  }
  if (left.committedAt.nanoseconds !== right.committedAt.nanoseconds) {
    return left.committedAt.nanoseconds - right.committedAt.nanoseconds;
  }
  return left.operationId.localeCompare(right.operationId);
};

const compareCommitTime = (
  left: JournalFirestoreCommitTime,
  right: JournalFirestoreCommitTime,
): number =>
  left.seconds === right.seconds
    ? left.nanoseconds - right.nanoseconds
    : left.seconds - right.seconds;

const decodeCursor = (value: string): JournalFirestoreCursor | undefined => {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.version !== 1) {
      return undefined;
    }
    const keys = Object.keys(parsed).sort();
    if (
      keys.length !== 4 ||
      keys[0] !== 'nanoseconds' ||
      keys[1] !== 'operationId' ||
      keys[2] !== 'seconds' ||
      keys[3] !== 'version' ||
      !isSafeDocumentId(parsed.operationId) ||
      !validCommitTime({
        seconds: parsed.seconds,
        nanoseconds: parsed.nanoseconds,
      })
    ) {
      return undefined;
    }
    return {
      committedAt: {
        seconds: parsed.seconds as number,
        nanoseconds: parsed.nanoseconds as number,
      },
      operationId: parsed.operationId,
    };
  } catch {
    return undefined;
  }
};

const encodeCursor = (cursor: JournalFirestoreCursor): string =>
  JSON.stringify({
    version: 1,
    seconds: cursor.committedAt.seconds,
    nanoseconds: cursor.committedAt.nanoseconds,
    operationId: cursor.operationId,
  });

const validateChangeForScope = (
  untrusted: unknown,
  scope: JournalWorkspaceScope,
): RemoteJournalChange | undefined => {
  const decoded = decodeRemoteJournalChange(untrusted);
  return decoded.ok && scopeMatches(changeScope(decoded.value), scope)
    ? decoded.value
    : undefined;
};

const aggregateInterveningRemoteChange = async (
  gateway: JournalFirestoreGateway,
  scope: JournalWorkspaceScope,
  local: RemoteJournalChange,
  current: RemoteJournalChange,
): Promise<RemoteJournalChange | undefined> => {
  if (current.changeKind === 'purge') {
    return current;
  }
  if (
    local.baseRevision !== null &&
    local.baseRevision > current.localRevision
  ) {
    return current;
  }
  const collectionPath = buildJournalFirestoreCollectionPaths(scope).operations;
  const entryId = changeEntityId(current);
  const records = await gateway.listOperations({collectionPath, entryId});
  const candidates: RemoteJournalChange[] = [];
  for (const record of records) {
    if (!validCommitTime(record.committedAt)) {
      return undefined;
    }
    const stored = decodeStoredOperation(record.data, record.operationId);
    if (stored === undefined || stored.entryId !== entryId) {
      return undefined;
    }
    if (stored.kind === 'compacted') {
      continue;
    }
    if (
      !scopeMatches(changeScope(stored.change), scope) ||
      changeEntityId(stored.change) !== entryId
    ) {
      return undefined;
    }
    candidates.push(stored.change);
  }
  const chain: RemoteJournalChange[] = [];
  let revision = local.baseRevision;
  while (revision !== current.localRevision) {
    const matches = candidates.filter(
      change =>
        change.baseRevision === revision &&
        change.localRevision <= current.localRevision,
    );
    if (matches.length !== 1 || chain.includes(matches[0]!)) {
      return undefined;
    }
    const next = matches[0]!;
    chain.push(next);
    revision = next.localRevision;
  }
  const head = chain[chain.length - 1];
  if (
    head === undefined ||
    head.operationId !== current.operationId ||
    canonicalJson(head) !== canonicalJson(current)
  ) {
    return undefined;
  }
  return {
    ...current,
    baseRevision: local.baseRevision,
    changedFields: [
      ...new Set(
        chain.reduce<string[]>((fields, change) => {
          fields.push(...change.changedFields);
          return fields;
        }, []),
      ),
    ],
  };
};

const compactPurgedOperations = async (
  gateway: JournalFirestoreGateway,
  scope: JournalWorkspaceScope,
  purge: Extract<RemoteJournalChange, {changeKind: 'purge'}>,
): Promise<boolean> => {
  const collectionPath = buildJournalFirestoreCollectionPaths(scope).operations;
  const entryId = purge.tombstone.entityId;
  const records = await gateway.listOperations({collectionPath, entryId});
  // Firestore rules have a 1,000-expression budget per multi-document request.
  // Compact one immutable health snapshot per transaction so a long history
  // cannot make a valid purge fail at the rules boundary.
  const chunkSize = 1;
  for (let offset = 0; offset < records.length; offset += chunkSize) {
    const chunk = records.slice(offset, offset + chunkSize);
    const compacted = await gateway.runTransaction(async transaction => {
      const writes: Array<{
        readonly path: string;
        readonly value: Readonly<Record<string, unknown>>;
      }> = [];
      for (const record of chunk) {
        const paths = buildJournalFirestorePaths(
          scope,
          entryId,
          record.operationId,
        );
        const snapshot = await transaction.get(paths.operation);
        if (!snapshot.exists || !isRecord(snapshot.data)) {
          return false;
        }
        const stored = decodeStoredOperation(snapshot.data, record.operationId);
        if (stored === undefined || stored.entryId !== entryId) {
          return false;
        }
        if (stored.kind === 'compacted') {
          continue;
        }
        if (
          !scopeMatches(changeScope(stored.change), scope) ||
          changeEntityId(stored.change) !== entryId
        ) {
          return false;
        }
        if (stored.change.changeKind === 'purge') {
          continue;
        }
        writes.push({
          path: paths.operation,
          value: {
            entryId,
            compactedChange: {
              schemaVersion: 1,
              operationId: stored.change.operationId,
              changeKind: 'upsert',
              baseRevision: stored.change.baseRevision,
              localRevision: stored.change.localRevision,
              changedFields: stored.change.changedFields,
              contentDigest: changeDigest(stored.change),
            },
            committedAt: snapshot.data.committedAt,
          },
        });
      }
      writes.forEach(write => transaction.set(write.path, write.value));
      return true;
    });
    if (!compacted) {
      return false;
    }
  }
  return true;
};

export const createFirebaseJournalRemoteAdapter = (
  dependencies: FirebaseJournalRemoteAdapterDependencies,
): JournalRemoteAdapter => ({
  async push(input) {
    let authenticatedUid: string | null;
    try {
      authenticatedUid = dependencies.authenticatedUid();
    } catch (error) {
      return journalRemoteError(mapFirestoreFailure(error));
    }
    const scopeDecision = evaluateJournalFirestoreScope(
      authenticatedUid,
      input.scope,
    );
    if (!scopeDecision.allowed) {
      return journalRemoteError(permissionFailure());
    }
    const change = validateChangeForScope(input.change, input.scope);
    if (change === undefined) {
      return journalRemoteError(
        rejectedFailure('The local Journal change is not safe to upload.'),
      );
    }
    let paths: ReturnType<typeof buildJournalFirestorePaths>;
    try {
      paths = buildJournalFirestorePaths(
        input.scope,
        changeEntityId(change),
        change.operationId,
      );
    } catch {
      return journalRemoteError(
        rejectedFailure('The Journal change contains an unsafe document ID.'),
      );
    }

    try {
      const transactionResult =
        await dependencies.gateway.runTransaction<PushTransactionResult>(
          async transaction => {
            const existingOperation = await transaction.get(paths.operation);
            if (existingOperation.exists) {
              const stored = decodeStoredOperation(
                existingOperation.data,
                change.operationId,
              );
              if (
                stored === undefined ||
                (stored.kind === 'full'
                  ? canonicalJson(stored.change) !== canonicalJson(change)
                  : stored.compactedChange.contentDigest !==
                    changeDigest(change))
              ) {
                return {
                  kind: 'rejected',
                  message:
                    'The Journal operation ID is already bound to different content.',
                };
              }
              return {kind: 'acknowledged'};
            }

            const currentEntry = await transaction.get(paths.entry);
            if (currentEntry.exists) {
              const current = decodeStoredEntryHead(
                currentEntry.data,
                changeEntityId(change),
              );
              if (current === undefined) {
                return {
                  kind: 'rejected',
                  message: 'The current remote Journal entry is invalid.',
                };
              }
              if (current.localRevision !== change.baseRevision) {
                const currentPaths = buildJournalFirestorePaths(
                  input.scope,
                  current.entityId,
                  current.operationId,
                );
                const currentOperation = await transaction.get(
                  currentPaths.operation,
                );
                if (!currentOperation.exists) {
                  return {
                    kind: 'rejected',
                    message: 'The current remote Journal operation is missing.',
                  };
                }
                const stored = decodeStoredOperation(
                  currentOperation.data,
                  current.operationId,
                );
                if (
                  stored === undefined ||
                  stored.kind !== 'full' ||
                  stored.entryId !== current.entityId ||
                  stored.change.localRevision !== current.localRevision ||
                  !scopeMatches(changeScope(stored.change), input.scope)
                ) {
                  return {
                    kind: 'rejected',
                    message: 'The current remote Journal operation is invalid.',
                  };
                }
                return {kind: 'conflict', remoteChange: stored.change};
              }
            } else if (change.baseRevision !== null) {
              return {
                kind: 'rejected',
                message:
                  'The remote Journal entry for this base revision is missing.',
              };
            }

            transaction.set(paths.entry, {
              schemaVersion: 1,
              entityId: changeEntityId(change),
              operationId: change.operationId,
              localRevision: change.localRevision,
            });
            transaction.set(paths.operation, {
              entryId: changeEntityId(change),
              change,
              committedAt: transaction.serverTimestamp(),
            });
            return {kind: 'acknowledged'};
          },
        );
      if (transactionResult.kind === 'rejected') {
        return journalRemoteError(rejectedFailure(transactionResult.message));
      }
      if (transactionResult.kind === 'conflict') {
        const current = validateChangeForScope(
          transactionResult.remoteChange,
          input.scope,
        );
        if (current === undefined) {
          return journalRemoteError(
            rejectedFailure('The current remote Journal operation is invalid.'),
          );
        }
        const remoteChange = await aggregateInterveningRemoteChange(
          dependencies.gateway,
          input.scope,
          change,
          current,
        );
        if (remoteChange === undefined) {
          return journalRemoteError(
            rejectedFailure(
              'The remote Journal revision history is incomplete or invalid.',
            ),
          );
        }
        return journalRemoteOk<JournalRemotePushResponse>({
          kind: 'conflict',
          remoteChange,
        });
      }
      if (
        change.changeKind === 'purge' &&
        !(await compactPurgedOperations(
          dependencies.gateway,
          input.scope,
          change,
        ))
      ) {
        return journalRemoteError(
          rejectedFailure(
            'The purged Journal history could not be compacted safely.',
          ),
        );
      }
      return journalRemoteOk<JournalRemotePushResponse>({
        kind: 'acknowledged',
        operationId: change.operationId,
        acceptedRevision: change.localRevision,
      });
    } catch (error) {
      return journalRemoteError(mapFirestoreFailure(error));
    }
  },

  async pull(input) {
    let authenticatedUid: string | null;
    try {
      authenticatedUid = dependencies.authenticatedUid();
    } catch (error) {
      return journalRemoteError(mapFirestoreFailure(error));
    }
    const scopeDecision = evaluateJournalFirestoreScope(
      authenticatedUid,
      input.scope,
    );
    if (!scopeDecision.allowed) {
      return journalRemoteError(permissionFailure());
    }
    const after =
      input.cursor === undefined ? undefined : decodeCursor(input.cursor);
    if (input.cursor !== undefined && after === undefined) {
      return journalRemoteError(
        rejectedFailure('The local Journal sync cursor is invalid.'),
      );
    }
    let collectionPath: string;
    try {
      collectionPath = buildJournalFirestoreCollectionPaths(
        input.scope,
      ).operations;
    } catch {
      return journalRemoteError(
        rejectedFailure(
          'The Journal Workspace contains an unsafe document ID.',
        ),
      );
    }

    try {
      const records = await dependencies.gateway.listOperations(
        after === undefined ? {collectionPath} : {collectionPath, after},
      );
      let latestCursor = after;
      let previousRecord: JournalFirestoreCursor | undefined;
      const changes: RemoteJournalChange[] = [];
      for (const record of records) {
        const cursor: JournalFirestoreCursor = {
          committedAt: record.committedAt,
          operationId: record.operationId,
        };
        const stored = decodeStoredOperation(record.data, record.operationId);
        if (
          !validCommitTime(record.committedAt) ||
          !isSafeDocumentId(record.operationId) ||
          stored === undefined ||
          !isSafeDocumentId(stored.entryId) ||
          (previousRecord !== undefined &&
            compareCursor(cursor, previousRecord) <= 0) ||
          (after !== undefined &&
            compareCommitTime(cursor.committedAt, after.committedAt) < 0)
        ) {
          return journalRemoteError(
            rejectedFailure('Firestore returned an invalid Journal operation.'),
          );
        }
        previousRecord = cursor;
        if (
          after !== undefined &&
          compareCommitTime(cursor.committedAt, after.committedAt) === 0 &&
          cursor.operationId === after.operationId
        ) {
          continue;
        }
        if (
          stored.kind === 'full' &&
          !scopeMatches(changeScope(stored.change), input.scope)
        ) {
          return journalRemoteError(
            rejectedFailure('Firestore returned an invalid Journal operation.'),
          );
        }
        if (stored.kind === 'full') {
          changes.push(stored.change);
        }
        if (
          latestCursor === undefined ||
          compareCursor(cursor, latestCursor) > 0
        ) {
          latestCursor = cursor;
        }
      }
      const response: JournalRemotePullResponse = {
        changes,
        ...(latestCursor === undefined
          ? {}
          : {cursor: encodeCursor(latestCursor)}),
      };
      return journalRemoteOk(response);
    } catch (error) {
      return journalRemoteError(mapFirestoreFailure(error));
    }
  },
});

import type {BrowserFirebaseAuth} from '../auth';
import type {
  JournalFirestoreCommitTime,
  JournalFirestoreGateway,
} from '../../native/journal/firebaseJournalRemoteAdapter';
import type {PersonalizationFirestoreGateway} from '../../native/personalization/firebaseProductPersonalizationRemoteAdapter';
import {createRequestAbortScope} from '../../../utils/requestAbortScope';

type FirestoreValue = Readonly<Record<string, unknown>>;

interface FirestoreDocument {
  readonly name?: unknown;
  readonly fields?: unknown;
}

const SERVER_TIMESTAMP = Symbol('firestore-server-timestamp');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const firestoreError = async (response: Response): Promise<Error> => {
  let code = `http-${response.status}`;
  let message = 'Firestore request failed.';
  try {
    const value: unknown = await response.json();
    if (isRecord(value) && isRecord(value.error)) {
      if (typeof value.error.status === 'string') {
        code = value.error.status.toLowerCase().replace(/_/g, '-');
      }
      if (typeof value.error.message === 'string') {
        message = value.error.message;
      }
    }
  } catch {
    // The stable status-derived code remains available to retry mapping.
  }
  return Object.assign(new Error(message), {code});
};

const timestampParts = (
  value: string,
): JournalFirestoreCommitTime | undefined => {
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/.exec(
    value,
  );
  if (!match?.[1]) {
    return undefined;
  }
  const milliseconds = Date.parse(`${match[1]}Z`);
  if (!Number.isFinite(milliseconds)) {
    return undefined;
  }
  return {
    seconds: Math.floor(milliseconds / 1_000),
    nanoseconds: Number((match[2] ?? '').padEnd(9, '0')) || 0,
  };
};

const encodeTimestamp = (value: JournalFirestoreCommitTime): string => {
  if (
    !Number.isSafeInteger(value.seconds) ||
    value.seconds < 0 ||
    !Number.isSafeInteger(value.nanoseconds) ||
    value.nanoseconds < 0 ||
    value.nanoseconds >= 1_000_000_000
  ) {
    throw new Error('Firestore cursor timestamp is invalid.');
  }
  const base = new Date(value.seconds * 1_000).toISOString().slice(0, 19);
  const fraction = value.nanoseconds.toString().padStart(9, '0');
  return `${base}.${fraction}Z`;
};

const decodeValue = (untrusted: unknown): unknown => {
  if (!isRecord(untrusted)) {
    throw new Error('Firestore value is invalid.');
  }
  if ('nullValue' in untrusted) {
    return null;
  }
  if (typeof untrusted.booleanValue === 'boolean') {
    return untrusted.booleanValue;
  }
  if (typeof untrusted.stringValue === 'string') {
    return untrusted.stringValue;
  }
  if (typeof untrusted.integerValue === 'string') {
    const value = Number(untrusted.integerValue);
    if (!Number.isSafeInteger(value)) {
      throw new Error('Firestore integer is invalid.');
    }
    return value;
  }
  if (
    typeof untrusted.doubleValue === 'number' &&
    Number.isFinite(untrusted.doubleValue)
  ) {
    return untrusted.doubleValue;
  }
  if (typeof untrusted.timestampValue === 'string') {
    const value = timestampParts(untrusted.timestampValue);
    if (!value) {
      throw new Error('Firestore timestamp is invalid.');
    }
    return value;
  }
  if (isRecord(untrusted.arrayValue)) {
    const values = untrusted.arrayValue.values;
    if (values === undefined) {
      return [];
    }
    if (!Array.isArray(values)) {
      throw new Error('Firestore array is invalid.');
    }
    return values.map(decodeValue);
  }
  if (isRecord(untrusted.mapValue)) {
    return decodeFields(untrusted.mapValue.fields);
  }
  throw new Error('Firestore value type is unsupported.');
};

const decodeFields = (untrusted: unknown): Record<string, unknown> => {
  if (untrusted === undefined) {
    return {};
  }
  if (!isRecord(untrusted)) {
    throw new Error('Firestore fields are invalid.');
  }
  return Object.fromEntries(
    Object.entries(untrusted).map(([key, value]) => [key, decodeValue(value)]),
  );
};

const encodeValue = (value: unknown): FirestoreValue => {
  if (value === null) {
    return {nullValue: null};
  }
  if (typeof value === 'boolean') {
    return {booleanValue: value};
  }
  if (typeof value === 'string') {
    return {stringValue: value};
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Cannot write a non-finite number.');
    }
    return Number.isSafeInteger(value)
      ? {integerValue: String(value)}
      : {doubleValue: value};
  }
  if (Array.isArray(value)) {
    return {arrayValue: {values: value.map(encodeValue)}};
  }
  if (isRecord(value)) {
    return {mapValue: {fields: encodeFields(value).fields}};
  }
  throw new Error('Cannot write an unsupported Firestore value.');
};

const encodeFields = (
  value: Readonly<Record<string, unknown>>,
): {
  readonly fields: Readonly<Record<string, FirestoreValue>>;
  readonly transforms: readonly string[];
} => {
  const fields: Record<string, FirestoreValue> = {};
  const transforms: string[] = [];
  Object.entries(value).forEach(([key, nested]) => {
    if (nested === SERVER_TIMESTAMP) {
      transforms.push(key);
      return;
    }
    if (nested === undefined) {
      return;
    }
    fields[key] = encodeValue(nested);
  });
  return {fields, transforms};
};

const safeDocumentPath = (value: string): string => {
  const segments = value.split('/');
  if (
    segments.length < 2 ||
    segments.length % 2 !== 0 ||
    segments.some(segment => !/^[A-Za-z0-9_-]{1,128}$/.test(segment))
  ) {
    throw new Error('Firestore document path is invalid.');
  }
  return segments.map(encodeURIComponent).join('/');
};

const safeCollectionPath = (
  value: string,
): {readonly parent: string; readonly collectionId: string} => {
  const segments = value.split('/');
  if (
    segments.length < 1 ||
    segments.length % 2 !== 1 ||
    segments.some(segment => !/^[A-Za-z0-9_-]{1,128}$/.test(segment))
  ) {
    throw new Error('Firestore collection path is invalid.');
  }
  return {
    parent: segments.slice(0, -1).map(encodeURIComponent).join('/'),
    collectionId: segments[segments.length - 1]!,
  };
};

interface PendingWrite {
  readonly documentPath: string;
  readonly value: Readonly<Record<string, unknown>>;
}

export interface FirestoreRestGatewayOptions {
  readonly projectId: string;
  readonly auth: Pick<BrowserFirebaseAuth, 'getIdToken'>;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

class FirestoreRestGateway
  implements JournalFirestoreGateway, PersonalizationFirestoreGateway
{
  private readonly request: typeof globalThis.fetch;
  private readonly databaseRoot: string;

  constructor(private readonly options: FirestoreRestGatewayOptions) {
    this.request = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.databaseRoot = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      options.projectId,
    )}/databases/(default)`;
  }

  private async authenticatedFetch<T>(
    url: string,
    consume: (response: Response) => Promise<T>,
    init?: RequestInit,
  ): Promise<T> {
    const abortScope = createRequestAbortScope({
      ...(init?.signal == null ? {} : {signal: init.signal}),
      timeoutMs: this.options.timeoutMs ?? 20_000,
    });
    try {
      abortScope.throwIfAborted();
      const token = await this.options.auth.getIdToken();
      abortScope.throwIfAborted();
      const response = await this.request(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body === undefined
            ? {}
            : {'Content-Type': 'application/json'}),
          ...(init?.headers ?? {}),
        },
        signal: abortScope.signal,
      });
      abortScope.throwIfAborted();
      const value = await consume(response);
      abortScope.throwIfAborted();
      return value;
    } catch (error) {
      if (abortScope.kind === 'cancelled') {
        const cancelled = Object.assign(
          new Error('Firestore request was cancelled.'),
          {code: 'cancelled'},
        );
        cancelled.name = 'AbortError';
        throw cancelled;
      }
      if (abortScope.kind === 'timeout') {
        throw Object.assign(new Error('Firestore request timed out.'), {
          code: 'deadline-exceeded',
        });
      }
      throw error;
    } finally {
      abortScope.dispose();
    }
  }

  private async readDocument(
    documentPath: string,
    transaction?: string,
  ): Promise<
    {readonly exists: false} | {readonly exists: true; readonly data: unknown}
  > {
    const suffix = transaction
      ? `?transaction=${encodeURIComponent(transaction)}`
      : '';
    return this.authenticatedFetch(
      `${this.databaseRoot}/documents/${safeDocumentPath(
        documentPath,
      )}${suffix}`,
      async response => {
        if (response.status === 404) {
          return {exists: false} as const;
        }
        if (!response.ok) {
          throw await firestoreError(response);
        }
        const value: unknown = await response.json();
        if (!isRecord(value)) {
          throw new Error('Firestore document is invalid.');
        }
        return {exists: true, data: decodeFields(value.fields)} as const;
      },
    );
  }

  get(documentPath: string) {
    return this.readDocument(documentPath);
  }

  async runTransaction<T>(
    operation: (transaction: {
      get(
        documentPath: string,
      ): Promise<
        | {readonly exists: false}
        | {readonly exists: true; readonly data: unknown}
      >;
      set(documentPath: string, value: Readonly<Record<string, unknown>>): void;
      serverTimestamp(): unknown;
    }) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const transactionId = await this.authenticatedFetch(
        `${this.databaseRoot}/documents:beginTransaction`,
        async response => {
          if (!response.ok) {
            throw await firestoreError(response);
          }
          const value: unknown = await response.json();
          if (!isRecord(value) || typeof value.transaction !== 'string') {
            throw new Error('Firestore transaction is invalid.');
          }
          return value.transaction;
        },
        {method: 'POST', body: JSON.stringify({options: {readWrite: {}}})},
      );
      const writes: PendingWrite[] = [];
      try {
        const result = await operation({
          get: path => this.readDocument(path, transactionId),
          set: (documentPath, value) => writes.push({documentPath, value}),
          serverTimestamp: () => SERVER_TIMESTAMP,
        });
        const encodedWrites = writes.map(write => {
          const encoded = encodeFields(write.value);
          const documentName = `${
            this.databaseRoot
          }/documents/${safeDocumentPath(write.documentPath)}`;
          return {
            update: {name: documentName, fields: encoded.fields},
            ...(encoded.transforms.length === 0
              ? {}
              : {
                  updateTransforms: encoded.transforms.map(fieldPath => ({
                    fieldPath,
                    setToServerValue: 'REQUEST_TIME',
                  })),
                }),
          };
        });
        const commit = await this.authenticatedFetch(
          `${this.databaseRoot}/documents:commit`,
          async response =>
            response.ok
              ? ({ok: true} as const)
              : ({
                  ok: false,
                  error: await firestoreError(response),
                  status: response.status,
                } as const),
          {
            method: 'POST',
            body: JSON.stringify({
              writes: encodedWrites,
              transaction: transactionId,
            }),
          },
        );
        if (commit.ok) {
          return result;
        }
        const error = commit.error;
        const code = String((error as Error & {code?: string}).code ?? '');
        if (!code.includes('aborted') && commit.status !== 409) {
          throw error;
        }
        lastError = error;
      } catch (error) {
        lastError = error;
        const code = String((error as Error & {code?: string}).code ?? '');
        if (!code.includes('aborted')) {
          throw error;
        }
      }
    }
    throw (
      lastError ?? new Error('Firestore transaction could not be committed.')
    );
  }

  async listOperations(input: {
    readonly collectionPath: string;
    readonly after?: {
      readonly committedAt: JournalFirestoreCommitTime;
      readonly operationId: string;
    };
    readonly entryId?: string;
  }) {
    const path = safeCollectionPath(input.collectionPath);
    const query: Record<string, unknown> = {
      from: [{collectionId: path.collectionId}],
    };
    if (input.entryId !== undefined) {
      query.where = {
        fieldFilter: {
          field: {fieldPath: 'entryId'},
          op: 'EQUAL',
          value: {stringValue: input.entryId},
        },
      };
    } else {
      query.orderBy = [
        {field: {fieldPath: 'committedAt'}, direction: 'ASCENDING'},
        {field: {fieldPath: '__name__'}, direction: 'ASCENDING'},
      ];
      if (input.after !== undefined) {
        query.startAt = {
          values: [{timestampValue: encodeTimestamp(input.after.committedAt)}],
          before: true,
        };
      }
    }
    const rows = await this.authenticatedFetch(
      `${this.databaseRoot}/documents${
        path.parent ? `/${path.parent}` : ''
      }:runQuery`,
      async response => {
        if (!response.ok) {
          throw await firestoreError(response);
        }
        const value: unknown = await response.json();
        if (!Array.isArray(value)) {
          throw new Error('Firestore query response is invalid.');
        }
        return value;
      },
      {method: 'POST', body: JSON.stringify({structuredQuery: query})},
    );
    const records = rows.flatMap(row => {
      if (!isRecord(row) || !isRecord(row.document)) {
        return [];
      }
      const document = row.document as FirestoreDocument;
      if (typeof document.name !== 'string') {
        return [];
      }
      const operationId = document.name.split('/').pop();
      if (!operationId || !/^[A-Za-z0-9_-]{1,128}$/.test(operationId)) {
        return [];
      }
      const data = decodeFields(document.fields);
      const committedAt = data.committedAt;
      if (
        !isRecord(committedAt) ||
        !Number.isSafeInteger(committedAt.seconds) ||
        !Number.isSafeInteger(committedAt.nanoseconds)
      ) {
        return [];
      }
      return [
        {
          operationId,
          committedAt: {
            seconds: committedAt.seconds as number,
            nanoseconds: committedAt.nanoseconds as number,
          },
          data,
        },
      ];
    });
    return records
      .filter(record => {
        if (input.after === undefined) {
          return true;
        }
        const seconds =
          record.committedAt.seconds - input.after.committedAt.seconds;
        const nanos =
          record.committedAt.nanoseconds - input.after.committedAt.nanoseconds;
        return (
          seconds > 0 ||
          (seconds === 0 &&
            (nanos > 0 ||
              (nanos === 0 && record.operationId >= input.after.operationId)))
        );
      })
      .sort((left, right) =>
        left.committedAt.seconds !== right.committedAt.seconds
          ? left.committedAt.seconds - right.committedAt.seconds
          : left.committedAt.nanoseconds !== right.committedAt.nanoseconds
          ? left.committedAt.nanoseconds - right.committedAt.nanoseconds
          : left.operationId.localeCompare(right.operationId),
      );
  }
}

export const createFirestoreRestGateway = (
  options: FirestoreRestGatewayOptions,
): JournalFirestoreGateway & PersonalizationFirestoreGateway =>
  new FirestoreRestGateway(options);

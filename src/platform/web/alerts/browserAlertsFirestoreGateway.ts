import type {
  AlertFirestoreGateway,
  AlertFirestoreListedDocument,
} from '../../../modules/alerts';
import type {BrowserFirebaseAuth} from '../auth';

type TransactionGateway = Pick<
  AlertFirestoreGateway,
  'get' | 'runTransaction'
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

const collectionPath = (value: string): string => {
  const segments = value.split('/');
  if (
    segments.length % 2 === 0 ||
    segments.length === 0 ||
    segments.some(segment => !/^[A-Za-z0-9_-]{1,128}$/.test(segment))
  ) {
    throw new Error('Alert Firestore collection path is invalid.');
  }
  return segments.map(encodeURIComponent).join('/');
};

const responseError = async (response: Response): Promise<Error> => {
  let message = `Firestore list failed (${response.status}).`;
  try {
    const value: unknown = await response.json();
    if (
      isRecord(value) &&
      isRecord(value.error) &&
      typeof value.error.message === 'string'
    ) {
      message = value.error.message;
    }
  } catch {
    // The status-derived error remains stable.
  }
  return new Error(message);
};

export const createBrowserAlertsFirestoreGateway = (input: {
  readonly projectId: string;
  readonly auth: Pick<BrowserFirebaseAuth, 'getIdToken'>;
  readonly transactions: TransactionGateway;
  readonly fetch?: typeof globalThis.fetch;
}): AlertFirestoreGateway => {
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(input.projectId)) {
    throw new Error('Firebase project ID is invalid.');
  }
  const request = input.fetch ?? globalThis.fetch.bind(globalThis);
  const root = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    input.projectId,
  )}/databases/(default)/documents`;
  return {
    get: input.transactions.get.bind(input.transactions),
    runTransaction: input.transactions.runTransaction.bind(input.transactions),
    async list(untrustedPath): Promise<readonly AlertFirestoreListedDocument[]> {
      const path = collectionPath(untrustedPath);
      const token = await input.auth.getIdToken();
      const records: AlertFirestoreListedDocument[] = [];
      let pageToken: string | undefined;
      do {
        const query = new URLSearchParams({pageSize: '250'});
        if (pageToken !== undefined) {
          query.set('pageToken', pageToken);
        }
        const response = await request(`${root}/${path}?${query.toString()}`, {
          headers: {Authorization: `Bearer ${token}`},
        });
        if (!response.ok) {
          throw await responseError(response);
        }
        const value: unknown = await response.json();
        if (!isRecord(value)) {
          throw new Error('Firestore list response is invalid.');
        }
        const documents = value.documents ?? [];
        if (!Array.isArray(documents)) {
          throw new Error('Firestore list response is invalid.');
        }
        documents.forEach(document => {
          if (!isRecord(document) || typeof document.name !== 'string') {
            throw new Error('Firestore listed document is invalid.');
          }
          const id = document.name.split('/').pop();
          if (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
            throw new Error('Firestore listed document ID is invalid.');
          }
          records.push({id, data: decodeFields(document.fields)});
        });
        pageToken =
          typeof value.nextPageToken === 'string' &&
          value.nextPageToken.length > 0
            ? value.nextPageToken
            : undefined;
        if (records.length > 1_000) {
          throw new Error('Alert sync collection exceeds its V1 bound.');
        }
      } while (pageToken !== undefined);
      return records;
    },
  };
};

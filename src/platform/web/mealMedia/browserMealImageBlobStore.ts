import {MEAL_IMAGE_MAX_BYTES} from '../../../modules/mealMedia';

const DATABASE_NAME = 'shani-product-web-meal-media-v1';
const STORE_NAME = 'meal-image-blobs';
const RETENTION_MS = 14 * 24 * 60 * 60 * 1_000;
const MAX_UPLOADED_CACHE_BYTES = 100 * 1_024 * 1_024;

interface StoredMealImageBlob {
  readonly schemaVersion: 1;
  readonly blob: Blob;
  readonly byteSize: number;
  readonly mimeType: string;
  readonly createdAtMs: number;
  readonly lastAccessedAtMs: number;
  readonly uploaded: boolean;
}

export interface BrowserMealImageBlobRepository {
  put(localUri: string, blob: Blob): Promise<void>;
  get(localUri: string): Promise<Blob | undefined>;
  markUploaded(localUri: string): Promise<void>;
  remove(localUri: string): Promise<void>;
  pruneUploaded(): Promise<void>;
}

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Meal Image storage request failed.'));
  });

const transactionComplete = (transaction: IDBTransaction): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Meal Image storage was aborted.'));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Meal Image storage failed.'));
  });

const isStoredBlob = (value: unknown): value is StoredMealImageBlob =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  'schemaVersion' in value &&
  value.schemaVersion === 1 &&
  'blob' in value &&
  value.blob instanceof Blob &&
  'byteSize' in value &&
  Number.isSafeInteger(value.byteSize) &&
  (value.byteSize as number) > 0 &&
  (value.byteSize as number) <= MEAL_IMAGE_MAX_BYTES &&
  value.blob.size === value.byteSize &&
  'mimeType' in value &&
  typeof value.mimeType === 'string' &&
  'createdAtMs' in value &&
  Number.isSafeInteger(value.createdAtMs) &&
  'lastAccessedAtMs' in value &&
  Number.isSafeInteger(value.lastAccessedAtMs) &&
  'uploaded' in value &&
  typeof value.uploaded === 'boolean';

export class IndexedDbMealImageBlobRepository
  implements BrowserMealImageBlobRepository
{
  private databasePromise: Promise<IDBDatabase> | undefined;

  constructor(
    private readonly factory: IDBFactory,
    private readonly now: () => number = Date.now,
    private readonly databaseName = DATABASE_NAME,
  ) {}

  async put(localUri: string, blob: Blob): Promise<void> {
    if (blob.size <= 0 || blob.size > MEAL_IMAGE_MAX_BYTES) {
      throw new Error('Meal Images must be 10 MB or smaller.');
    }
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const completed = transactionComplete(transaction);
    const nowMs = this.now();
    const record: StoredMealImageBlob = {
      schemaVersion: 1,
      blob,
      byteSize: blob.size,
      mimeType: blob.type,
      createdAtMs: nowMs,
      lastAccessedAtMs: nowMs,
      uploaded: false,
    };
    await requestResult(
      transaction.objectStore(STORE_NAME).put(record, localUri),
    );
    await completed;
  }

  async get(localUri: string): Promise<Blob | undefined> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const value: unknown = await requestResult(store.get(localUri));
    if (value === undefined) {
      await completed;
      return undefined;
    }
    if (!isStoredBlob(value)) {
      await requestResult(store.delete(localUri));
      await completed;
      return undefined;
    }
    await requestResult(
      store.put({...value, lastAccessedAtMs: this.now()}, localUri),
    );
    await completed;
    return value.blob;
  }

  async markUploaded(localUri: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const value: unknown = await requestResult(store.get(localUri));
    if (isStoredBlob(value)) {
      await requestResult(
        store.put(
          {...value, uploaded: true, lastAccessedAtMs: this.now()},
          localUri,
        ),
      );
    }
    await completed;
    await this.pruneUploaded();
  }

  async remove(localUri: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const completed = transactionComplete(transaction);
    await requestResult(transaction.objectStore(STORE_NAME).delete(localUri));
    await completed;
  }

  async pruneUploaded(): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const [keys, values] = await Promise.all([
      requestResult(store.getAllKeys()),
      requestResult(store.getAll()),
    ]);
    const nowMs = this.now();
    const uploaded = values.flatMap((value, index) => {
      const key = keys[index];
      return typeof key === 'string' && isStoredBlob(value) && value.uploaded
        ? [{key, value}]
        : [];
    });
    const removals = new Set(
      uploaded
        .filter(row => row.value.lastAccessedAtMs < nowMs - RETENTION_MS)
        .map(row => row.key),
    );
    let retainedBytes = uploaded
      .filter(row => !removals.has(row.key))
      .reduce((total, row) => total + row.value.byteSize, 0);
    const oldestFirst = uploaded
      .filter(row => !removals.has(row.key))
      .sort(
        (left, right) =>
          left.value.lastAccessedAtMs - right.value.lastAccessedAtMs,
      );
    while (retainedBytes > MAX_UPLOADED_CACHE_BYTES && oldestFirst.length > 0) {
      const row = oldestFirst.shift()!;
      removals.add(row.key);
      retainedBytes -= row.value.byteSize;
    }
    await Promise.all(
      [...removals].map(key => requestResult(store.delete(key))),
    );
    await completed;
  }

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise !== undefined) {
      return this.databasePromise;
    }
    this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () =>
        reject(
          request.error ?? new Error('Meal Image storage could not be opened.'),
        );
      request.onblocked = () =>
        reject(new Error('Meal Image storage upgrade is blocked.'));
    });
    this.databasePromise.catch(() => {
      this.databasePromise = undefined;
    });
    return this.databasePromise;
  }
}

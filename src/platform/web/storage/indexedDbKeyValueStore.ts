const DEFAULT_DATABASE_NAME = 'shani-product-web-v1';
const STORE_NAME = 'key-values';

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed.'));
  });

const transactionComplete = (transaction: IDBTransaction): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });

export interface IndexedDbItemUpdate<TResult> {
  /** Omitting the value leaves the current stored value unchanged. */
  readonly value?: string;
  readonly result: TResult;
}

/**
 * Small asynchronous key/value seam backed by IndexedDB.
 *
 * It is intentionally compatible with both the Journal and Personalization
 * stores. Product and domain code therefore stay identical on native and web.
 */
export class IndexedDbKeyValueStore {
  private databasePromise: Promise<IDBDatabase> | undefined;

  constructor(
    private readonly factory: IDBFactory,
    private readonly databaseName = DEFAULT_DATABASE_NAME,
  ) {}

  async getItem(key: string): Promise<string | null> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const completed = transactionComplete(transaction);
    const value = await requestResult(
      transaction.objectStore(STORE_NAME).get(key),
    );
    await completed;
    if (value === undefined) {
      return null;
    }
    if (typeof value !== 'string') {
      throw new Error('Browser storage contains an invalid value.');
    }
    return value;
  }

  async setItem(key: string, value: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const completed = transactionComplete(transaction);
    await requestResult(transaction.objectStore(STORE_NAME).put(value, key));
    await completed;
  }

  async removeItem(key: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const completed = transactionComplete(transaction);
    await requestResult(transaction.objectStore(STORE_NAME).delete(key));
    await completed;
  }

  async getAllKeys(): Promise<readonly string[]> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const completed = transactionComplete(transaction);
    const values = await requestResult(
      transaction.objectStore(STORE_NAME).getAllKeys(),
    );
    await completed;
    return values.filter((value): value is string => typeof value === 'string');
  }

  /** One-key atomic update, including across multiple tabs. */
  async updateItem<TResult>(
    key: string,
    update: (current: string | null) => IndexedDbItemUpdate<TResult>,
  ): Promise<TResult> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const completed = transactionComplete(transaction);
    const objectStore = transaction.objectStore(STORE_NAME);
    const untrusted = await requestResult(objectStore.get(key));
    if (untrusted !== undefined && typeof untrusted !== 'string') {
      transaction.abort();
      await completed;
      throw new Error('Browser storage contains an invalid value.');
    }
    const next = update(untrusted ?? null);
    if (next.value !== undefined) {
      await requestResult(objectStore.put(next.value, key));
    }
    await completed;
    return next.result;
  }

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise !== undefined) {
      return this.databasePromise;
    }

    this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () =>
        reject(request.error ?? new Error('IndexedDB could not be opened.'));
      request.onblocked = () =>
        reject(new Error('IndexedDB upgrade is blocked by another tab.'));
    });

    this.databasePromise.catch(() => {
      this.databasePromise = undefined;
    });
    return this.databasePromise;
  }
}

export const createBrowserKeyValueStore = (): IndexedDbKeyValueStore => {
  if (typeof globalThis.indexedDB === 'undefined') {
    throw new Error('This browser does not provide IndexedDB.');
  }
  return new IndexedDbKeyValueStore(globalThis.indexedDB);
};

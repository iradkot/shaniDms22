import {parseMealImageObjectPath} from './objectPath';

const STORAGE_KEY = 'meal-images:deletion-queue:v1';

const isSafeObjectPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  parseMealImageObjectPath(value) !== undefined;

export interface MealImageStringStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const decode = (value: string | null): readonly string[] => {
  if (value === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      !('schemaVersion' in parsed) ||
      parsed.schemaVersion !== 1 ||
      !('objectPaths' in parsed) ||
      !Array.isArray(parsed.objectPaths) ||
      parsed.objectPaths.some(path => !isSafeObjectPath(path))
    ) {
      return [];
    }
    return [...new Set(parsed.objectPaths as string[])];
  } catch {
    return [];
  }
};

const encode = (objectPaths: readonly string[]): string =>
  JSON.stringify({schemaVersion: 1, objectPaths});

/** Durable, serialized cleanup queue. Unsafe persisted paths are never used. */
export class DurableMealImageDeletionQueue {
  private serial: Promise<void> = Promise.resolve();

  constructor(private readonly strings: MealImageStringStore) {}

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.serial.then(operation, operation);
    this.serial = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  getSnapshot(): Promise<readonly string[]> {
    return this.run(async () => decode(await this.strings.getItem(STORAGE_KEY)));
  }

  enqueue(objectPath: string): Promise<void> {
    if (!isSafeObjectPath(objectPath)) {
      return Promise.reject(new Error('The Meal Image deletion path is invalid.'));
    }
    return this.run(async () => {
      const current = decode(await this.strings.getItem(STORAGE_KEY));
      if (current.includes(objectPath)) {
        return;
      }
      await this.strings.setItem(STORAGE_KEY, encode([...current, objectPath]));
    });
  }

  flush(
    remove: (objectPath: string) => Promise<void>,
  ): Promise<{readonly removed: number; readonly pending: number}> {
    return this.run(async () => {
      const current = decode(await this.strings.getItem(STORAGE_KEY));
      const pending: string[] = [];
      let removed = 0;
      for (const objectPath of current) {
        try {
          await remove(objectPath);
          removed += 1;
        } catch {
          pending.push(objectPath);
        }
      }
      await this.strings.setItem(STORAGE_KEY, encode(pending));
      return {removed, pending: pending.length};
    });
  }
}

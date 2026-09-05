import type {JournalWorkspaceScope} from '../../domain/journal';
import type {
  JournalLocalCommitResult,
  JournalLocalRead,
  JournalLocalStore,
  PersistedJournalState,
} from '../../engine/types';
import {journalScopeStorageKey} from './scopeKey';

/** Compatible with AsyncStorage on native and a small IndexedDB wrapper on web. */
export interface JournalStringKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/**
 * Stores state and outbox in one value, so a successful set cannot persist one
 * without the other.
 */
export class KeyValueJournalLocalStore implements JournalLocalStore {
  private static readonly mutationTails = new Map<string, Promise<void>>();

  constructor(private readonly storage: JournalStringKeyValueStore) {}

  async read(scope: JournalWorkspaceScope): Promise<JournalLocalRead> {
    const raw = await this.storage.getItem(journalScopeStorageKey(scope));
    if (raw === null) {
      return {generation: 0, value: null};
    }
    return decodeEnvelope(JSON.parse(raw) as unknown);
  }

  async commit(
    scope: JournalWorkspaceScope,
    expectedGeneration: number,
    state: PersistedJournalState,
  ): Promise<JournalLocalCommitResult> {
    const key = journalScopeStorageKey(scope);
    return this.serialize(key, async () => {
      const raw = await this.storage.getItem(key);
      const current =
        raw === null
          ? {generation: 0, value: null}
          : decodeEnvelope(JSON.parse(raw) as unknown);
      if (current.generation !== expectedGeneration) {
        return {ok: false, actualGeneration: current.generation};
      }
      const generation = current.generation + 1;
      await this.storage.setItem(
        key,
        JSON.stringify({
          journalEnvelopeVersion: 1,
          generation,
          value: state,
        }),
      );
      return {ok: true, generation};
    });
  }

  private serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous =
      KeyValueJournalLocalStore.mutationTails.get(key) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    KeyValueJournalLocalStore.mutationTails.set(key, tail);
    return result;
  }
}

const decodeEnvelope = (value: unknown): JournalLocalRead => {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'journalEnvelopeVersion' in value &&
    'generation' in value &&
    'value' in value &&
    value.journalEnvelopeVersion === 1 &&
    Number.isSafeInteger(value.generation) &&
    (value.generation as number) >= 0
  ) {
    return {
      generation: value.generation as number,
      value: value.value,
    };
  }
  // Pre-CAS V1 values are read as generation zero and migrate on first write.
  return {generation: 0, value};
};

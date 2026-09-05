import type {JournalWorkspaceScope} from '../../domain/journal';
import type {
  JournalLocalCommitResult,
  JournalLocalRead,
  JournalLocalStore,
  PersistedJournalState,
} from '../../engine/types';
import {journalScopeStorageKey} from './scopeKey';

const cloneAcrossStorageBoundary = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

/** Test/preview Adapter with the same untrusted JSON boundary as production. */
export class InMemoryJournalLocalStore implements JournalLocalStore {
  private readonly values = new Map<
    string,
    {readonly generation: number; readonly value: unknown}
  >();

  async read(scope: JournalWorkspaceScope): Promise<JournalLocalRead> {
    const stored = this.values.get(journalScopeStorageKey(scope));
    return stored === undefined
      ? {generation: 0, value: null}
      : {
          generation: stored.generation,
          value: cloneAcrossStorageBoundary(stored.value),
        };
  }

  async commit(
    scope: JournalWorkspaceScope,
    expectedGeneration: number,
    state: PersistedJournalState,
  ): Promise<JournalLocalCommitResult> {
    const key = journalScopeStorageKey(scope);
    const actualGeneration = this.values.get(key)?.generation ?? 0;
    if (actualGeneration !== expectedGeneration) {
      return {ok: false, actualGeneration};
    }
    const generation = actualGeneration + 1;
    this.values.set(key, {
      generation,
      value: cloneAcrossStorageBoundary(state),
    });
    return {ok: true, generation};
  }

  /** Inserts untrusted data for migration/corruption contract tests. */
  seed(scope: JournalWorkspaceScope, value: unknown): void {
    this.values.set(journalScopeStorageKey(scope), {generation: 1, value});
  }
}

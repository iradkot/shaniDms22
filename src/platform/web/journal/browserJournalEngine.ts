import {
  AppOwnedUriJournalMediaStore,
  createJournalEngine,
  journalScopeStorageKey,
} from '../../../modules/journal';
import type {
  JournalClock,
  JournalEngine,
  JournalEntityKind,
  JournalIdGenerator,
  JournalLocalCommitResult,
  JournalLocalRead,
  JournalLocalStore,
  JournalMediaStore,
  JournalRemoteAdapter,
  JournalWorkspaceScope,
  PersistedJournalState,
} from '../../../modules/journal';
import {createOpaqueBrowserId} from '../identity';
import type {IndexedDbItemUpdate} from '../storage';

export interface AtomicBrowserJournalStorage {
  getItem(key: string): Promise<string | null>;
  updateItem<TResult>(
    key: string,
    update: (current: string | null) => IndexedDbItemUpdate<TResult>,
  ): Promise<TResult>;
}

class BrowserJournalIds implements JournalIdGenerator {
  nextEntryId(kind: JournalEntityKind): string {
    return `${kind}_${createOpaqueBrowserId()}`;
  }

  nextOperationId(): string {
    return `operation_${createOpaqueBrowserId()}`;
  }
}

const browserClock: JournalClock = {now: () => Date.now()};

const decodeEnvelope = (raw: string | null): JournalLocalRead => {
  if (raw === null) {
    return {generation: 0, value: null};
  }
  const value = JSON.parse(raw) as unknown;
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
    return {generation: value.generation as number, value: value.value};
  }
  return {generation: 0, value};
};

class BrowserJournalLocalStore implements JournalLocalStore {
  constructor(private readonly storage: AtomicBrowserJournalStorage) {}

  async read(scope: JournalWorkspaceScope): Promise<JournalLocalRead> {
    return decodeEnvelope(
      await this.storage.getItem(journalScopeStorageKey(scope)),
    );
  }

  commit(
    scope: JournalWorkspaceScope,
    expectedGeneration: number,
    state: PersistedJournalState,
  ): Promise<JournalLocalCommitResult> {
    return this.storage.updateItem<JournalLocalCommitResult>(
      journalScopeStorageKey(scope),
      currentRaw => {
        const current = decodeEnvelope(currentRaw);
        if (current.generation !== expectedGeneration) {
          return {
            result: {
              ok: false,
              actualGeneration: current.generation,
            } as const,
          };
        }
        const generation = current.generation + 1;
        return {
          value: JSON.stringify({
            journalEnvelopeVersion: 1,
            generation,
            value: state,
          }),
          result: {ok: true, generation} as const,
        };
      },
    );
  }
}

/**
 * Browser Journal is deliberately local-first and has no pretend remote.
 * Adding Firebase web sync means supplying the real JournalRemoteAdapter here.
 */
export const createBrowserJournalEngine = (
  storage: AtomicBrowserJournalStorage,
  remoteAdapter?: JournalRemoteAdapter,
  mediaStore: JournalMediaStore = new AppOwnedUriJournalMediaStore(),
): JournalEngine =>
  createJournalEngine({
    localStore: new BrowserJournalLocalStore(storage),
    clock: browserClock,
    ids: new BrowserJournalIds(),
    mediaStore,
    ...(remoteAdapter === undefined ? {} : {remoteAdapter}),
  });

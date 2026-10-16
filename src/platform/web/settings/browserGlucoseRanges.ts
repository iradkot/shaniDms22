import {
  DEFAULT_GLUCOSE_RANGE_THRESHOLDS,
  isValidGlucoseRangeThresholds,
} from '../../../modules/settings/glucoseRanges';
import type {TrendsRangeThresholds} from '../../../modules/trends';
import {
  accountWorkspaceScopeId,
  assertLocalAccountActive,
  withLocalAccountWrite,
  type LocalAccountWorkspaceScope,
} from '../../../modules/privacy/localAccountCleanup';

interface GlucoseRangeStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface BrowserGlucoseRanges {
  initialize(): Promise<void>;
  getSnapshot(): TrendsRangeThresholds;
  subscribe(listener: () => void): () => void;
  save(thresholds: TrendsRangeThresholds): Promise<void>;
}

/** One durable range preference for an account and workspace, across data sources. */
export function createBrowserGlucoseRanges(input: {
  readonly storage: GlucoseRangeStorage;
  readonly scope: LocalAccountWorkspaceScope;
  readonly isCurrentScope: () => boolean;
}): BrowserGlucoseRanges {
  const scope = {...input.scope};
  const key = `shani.web.glucose-ranges.v1:${accountWorkspaceScopeId(scope)}`;
  const listeners = new Set<() => void>();
  let snapshot: TrendsRangeThresholds = DEFAULT_GLUCOSE_RANGE_THRESHOLDS;
  let initialized = false;
  let writeTail = Promise.resolve();
  const assertCurrentScope = () => {
    if (!input.isCurrentScope()) {
      throw new Error('The glucose range workspace has changed.');
    }
  };
  return {
    initialize: async () => {
      assertCurrentScope();
      await assertLocalAccountActive(input.storage, scope.productUserId);
      const raw = await input.storage.getItem(key);
      assertCurrentScope();
      if (raw !== null) {
        try {
          const value: unknown = JSON.parse(raw);
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            const record = value as Record<string, unknown>;
            if (
              record.schemaVersion === 1 &&
              record.productUserId === scope.productUserId &&
              record.workspaceId === scope.workspaceId &&
              isValidGlucoseRangeThresholds(record.thresholds)
            ) {
              snapshot = {...record.thresholds};
            }
          }
        } catch {
          // Corrupt persisted values never become clinical display thresholds.
        }
      }
      initialized = true;
    },
    getSnapshot: () => snapshot,
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    save: thresholds => {
      if (!initialized || !isValidGlucoseRangeThresholds(thresholds)) {
        return Promise.reject(new Error('Glucose ranges are not ready or invalid.'));
      }
      const next = {...thresholds};
      const run = writeTail.then(async () => {
        assertCurrentScope();
        await withLocalAccountWrite(input.storage, scope.productUserId, async () => {
          assertCurrentScope();
          await input.storage.setItem(key, JSON.stringify({
            schemaVersion: 1,
            productUserId: scope.productUserId,
            workspaceId: scope.workspaceId,
            thresholds: next,
          }));
        });
        assertCurrentScope();
        snapshot = next;
        listeners.forEach(listener => listener());
      });
      writeTail = run.catch(() => undefined);
      return run;
    },
  };
}

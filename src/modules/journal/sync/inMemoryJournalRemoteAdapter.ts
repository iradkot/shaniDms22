import type {JournalWorkspaceScope} from '../domain/journal';
import {journalRemoteError, journalRemoteOk} from './remoteAdapter';
import type {
  JournalRemoteAdapter,
  JournalRemotePushResponse,
} from './remoteAdapter';
import {decodeRemoteJournalChange} from './remoteChangeCodec';
import type {RemoteJournalChange} from './remoteChangeTypes';

interface RemoteWorkspaceState {
  readonly feed: RemoteJournalChange[];
  readonly latestByEntity: Map<string, RemoteJournalChange>;
  readonly acknowledgements: Map<
    string,
    {
      readonly response: JournalRemotePushResponse;
      readonly canonicalChange: string;
    }
  >;
}

const scopeKey = (scope: JournalWorkspaceScope): string =>
  `${encodeURIComponent(scope.productUserId)}:${encodeURIComponent(
    scope.workspaceId,
  )}:${encodeURIComponent(scope.nightscoutSourceId)}`;

const changeScope = (change: RemoteJournalChange) =>
  change.changeKind === 'upsert' ? change.document.scope : change.scope;

const entityKey = (change: RemoteJournalChange): string =>
  change.changeKind === 'upsert'
    ? `${change.document.documentKind}:${change.document.entityId}`
    : `${change.tombstone.entityKind}:${change.tombstone.entityId}`;

const belongsTo = (
  change: RemoteJournalChange,
  scope: JournalWorkspaceScope,
): boolean => {
  const remoteScope = changeScope(change);
  return (
    remoteScope.ownerProductUserId === scope.productUserId &&
    remoteScope.workspaceId === scope.workspaceId &&
    remoteScope.nightscoutSourceId === scope.nightscoutSourceId
  );
};

const conflictWithInterveningFields = (
  state: RemoteWorkspaceState,
  local: RemoteJournalChange,
  current: RemoteJournalChange,
): RemoteJournalChange => {
  if (current.changeKind === 'purge') {
    return current;
  }
  const key = entityKey(current);
  const candidates = state.feed.filter(change => entityKey(change) === key);
  const chain: RemoteJournalChange[] = [];
  let revision = local.baseRevision;
  while (revision !== current.localRevision) {
    const next = candidates.find(change => change.baseRevision === revision);
    if (next === undefined || chain.includes(next)) {
      return current;
    }
    chain.push(next);
    revision = next.localRevision;
  }
  return {
    ...current,
    baseRevision: local.baseRevision,
    changedFields: [
      ...new Set(chain.reduce<string[]>((fields, change) => {
        fields.push(...change.changedFields);
        return fields;
      }, [])),
    ],
  };
};

/** Deterministic reference Adapter for contract tests and local development. */
export const createInMemoryJournalRemoteAdapter = (): JournalRemoteAdapter => {
  const workspaces = new Map<string, RemoteWorkspaceState>();
  const workspaceFor = (scope: JournalWorkspaceScope): RemoteWorkspaceState => {
    const key = scopeKey(scope);
    const existing = workspaces.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const created: RemoteWorkspaceState = {
      feed: [],
      latestByEntity: new Map(),
      acknowledgements: new Map(),
    };
    workspaces.set(key, created);
    return created;
  };

  return {
    async push({scope, change: untrustedChange}) {
      const decoded = decodeRemoteJournalChange(untrustedChange);
      if (!decoded.ok || !belongsTo(untrustedChange, scope)) {
        return journalRemoteError({
          code: 'remote_rejected',
          message: 'The remote Journal change has an invalid scope or shape.',
          retryable: false,
        });
      }
      const change = decoded.value;
      const state = workspaceFor(scope);
      const previousAcknowledgement = state.acknowledgements.get(
        change.operationId,
      );
      if (previousAcknowledgement !== undefined) {
        return previousAcknowledgement.canonicalChange ===
          JSON.stringify(change)
          ? journalRemoteOk(previousAcknowledgement.response)
          : journalRemoteError({
              code: 'remote_rejected',
              message:
                'A Journal operation ID cannot be reused for different content.',
              retryable: false,
            });
      }
      const key = entityKey(change);
      const current = state.latestByEntity.get(key);
      const currentRevision = current?.localRevision ?? null;
      if (change.baseRevision !== currentRevision) {
        return current === undefined
          ? journalRemoteError({
              code: 'remote_rejected',
              message: 'The remote base revision does not exist.',
              retryable: false,
            })
          : journalRemoteOk({
              kind: 'conflict',
              remoteChange: conflictWithInterveningFields(
                state,
                change,
                current,
              ),
            });
      }
      state.latestByEntity.set(key, change);
      state.feed.push(change);
      const acknowledgement: JournalRemotePushResponse = {
        kind: 'acknowledged',
        operationId: change.operationId,
        acceptedRevision: change.localRevision,
      };
      state.acknowledgements.set(change.operationId, {
        response: acknowledgement,
        canonicalChange: JSON.stringify(change),
      });
      return journalRemoteOk(acknowledgement);
    },

    async pull({scope, cursor}) {
      const match =
        cursor === undefined
          ? undefined
          : /^journal-cursor:(\d+)$/.exec(cursor);
      if (cursor !== undefined && match === null) {
        return journalRemoteError({
          code: 'remote_rejected',
          message: 'The remote Journal cursor is invalid.',
          retryable: false,
        });
      }
      const start = match == null ? 0 : Number(match[1]);
      const state = workspaceFor(scope);
      if (
        !Number.isSafeInteger(start) ||
        start < 0 ||
        start > state.feed.length
      ) {
        return journalRemoteError({
          code: 'remote_rejected',
          message: 'The remote Journal cursor is out of range.',
          retryable: false,
        });
      }
      return journalRemoteOk({
        changes: state.feed.slice(start),
        cursor: `journal-cursor:${state.feed.length}`,
      });
    },
  };
};

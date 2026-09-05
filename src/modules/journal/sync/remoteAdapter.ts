import type {JournalWorkspaceScope} from '../domain/journal';
import type {Revision} from '../domain/identifiers';
import type {RemoteJournalChange} from './remoteChangeTypes';

export type JournalRemoteFailureCode =
  | 'offline'
  | 'permission_denied'
  | 'remote_rejected'
  | 'unknown';

export interface JournalRemoteFailure {
  readonly code: JournalRemoteFailureCode;
  readonly message: string;
  readonly retryable: boolean;
}

export type JournalRemoteResult<T> =
  | {readonly ok: true; readonly value: T}
  | {readonly ok: false; readonly error: JournalRemoteFailure};

export const journalRemoteOk = <T>(value: T): JournalRemoteResult<T> => ({
  ok: true,
  value,
});

export const journalRemoteError = (
  error: JournalRemoteFailure,
): JournalRemoteResult<never> => ({ok: false, error});

export interface JournalRemotePushInput {
  readonly scope: JournalWorkspaceScope;
  readonly change: RemoteJournalChange;
}

export type JournalRemotePushResponse =
  | {
      readonly kind: 'acknowledged';
      readonly operationId: string;
      readonly acceptedRevision: Revision;
    }
  | {
      readonly kind: 'conflict';
      readonly remoteChange: unknown;
    };

export interface JournalRemotePullInput {
  readonly scope: JournalWorkspaceScope;
  readonly cursor?: string;
}

export interface JournalRemotePullResponse {
  /** Every value crosses an untrusted remote boundary and is decoded by the coordinator. */
  readonly changes: readonly unknown[];
  readonly cursor?: string;
}

/**
 * Transport-neutral cloud Seam. Implementations must make a repeated
 * `operationId` idempotent and compare `baseRevision` atomically.
 */
export interface JournalRemoteAdapter {
  push(
    input: JournalRemotePushInput,
  ): Promise<JournalRemoteResult<JournalRemotePushResponse>>;
  pull(
    input: JournalRemotePullInput,
  ): Promise<JournalRemoteResult<JournalRemotePullResponse>>;
}

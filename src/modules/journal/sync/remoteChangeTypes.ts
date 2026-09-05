import type {JournalTombstone} from '../domain/tombstones';
import type {Revision} from '../domain/identifiers';
import type {
  RemoteJournalDocument,
  RemoteJournalDocumentScope,
} from './remoteDocumentTypes';

export const JOURNAL_REMOTE_CHANGE_SCHEMA_VERSION = 1 as const;

interface RemoteJournalChangeBase {
  readonly schemaVersion: typeof JOURNAL_REMOTE_CHANGE_SCHEMA_VERSION;
  readonly operationId: string;
  readonly baseRevision: Revision | null;
  readonly localRevision: Revision;
  readonly changedFields: readonly string[];
}

export interface RemoteJournalUpsertChange extends RemoteJournalChangeBase {
  readonly changeKind: 'upsert';
  readonly document: RemoteJournalDocument;
}

export interface RemoteJournalPurgeChange extends RemoteJournalChangeBase {
  readonly changeKind: 'purge';
  readonly scope: RemoteJournalDocumentScope;
  readonly tombstone: JournalTombstone;
}

export type RemoteJournalChange =
  | RemoteJournalUpsertChange
  | RemoteJournalPurgeChange;

import type {ActivityEntryId, MealEntryId, Revision} from './identifiers';

interface JournalTombstoneBase {
  readonly kind: 'journal_tombstone';
  readonly purgedAt: number;
  /** The revision created by the purge operation. */
  readonly revision: Revision;
}

export type JournalTombstone =
  | (JournalTombstoneBase & {
      readonly entityKind: 'meal';
      readonly entityId: MealEntryId;
    })
  | (JournalTombstoneBase & {
      readonly entityKind: 'activity';
      readonly entityId: ActivityEntryId;
    });

import {
  parseActivityEntryId,
  parseMealEntryId,
  parseRevision,
} from '../../src/modules/journal';
import type {
  JournalOutboxOperation,
  ParseResult,
} from '../../src/modules/journal';
import {selectJournalOperationalBadges} from '../../src/product/app';
import {CORE_DESTINATION_IDS} from '../../src/product/destinations';

function valueOf<T>(result: ParseResult<T>): T {
  if (!result.ok) {
    throw new Error('Invalid test value.');
  }
  return result.value;
}

const revision = valueOf(parseRevision(1));

const operation = (
  operationId: string,
  entityKind: 'meal' | 'activity',
): JournalOutboxOperation => ({
  kind: 'upsert',
  operationId,
  entityKind,
  entityId:
    entityKind === 'meal'
      ? valueOf(parseMealEntryId(`meal-${operationId}`))
      : valueOf(parseActivityEntryId(`activity-${operationId}`)),
  baseRevision: null,
  localRevision: revision,
  queuedAt: 1_700_000_000_000,
  changedFields: ['name'],
});

describe('Journal Hub badges', () => {
  it('keeps pending Meal and Activity work separate', () => {
    const badges = selectJournalOperationalBadges(
      [
        operation('one', 'meal'),
        operation('two', 'meal'),
        operation('three', 'activity'),
      ],
      'en',
    );

    expect(badges.get(CORE_DESTINATION_IDS.meals)).toEqual({
      label: '2 changes waiting to sync',
      tone: 'attention',
    });
    expect(badges.get(CORE_DESTINATION_IDS.activity)).toEqual({
      label: '1 change waiting to sync',
      tone: 'attention',
    });
  });

  it('returns no badges for a clean outbox and uses clear Hebrew copy', () => {
    expect(selectJournalOperationalBadges([], 'he').size).toBe(0);
    expect(
      selectJournalOperationalBadges([operation('one', 'activity')], 'he').get(
        CORE_DESTINATION_IDS.activity,
      ),
    ).toEqual({label: '1 שינוי ממתין לסנכרון', tone: 'attention'});
  });
});

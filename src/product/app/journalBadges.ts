import type {JournalOutboxOperation} from '../../modules/journal';
import {CORE_DESTINATION_IDS} from '../destinations';
import type {DestinationLocale} from '../destinations';
import type {OperationalBadge} from '../hub';

const COPY = {
  en: (count: number) =>
    `${count} ${count === 1 ? 'change' : 'changes'} waiting to sync`,
  he: (count: number) =>
    `${count} ${count === 1 ? 'שינוי ממתין' : 'שינויים ממתינים'} לסנכרון`,
} as const;

/** Keeps Journal details out of the Hub while exposing useful pending work. */
export const selectJournalOperationalBadges = (
  outbox: readonly JournalOutboxOperation[],
  locale: DestinationLocale,
): ReadonlyMap<string, OperationalBadge> => {
  const counts = outbox.reduce(
    (current, operation) => ({
      ...current,
      [operation.entityKind]: current[operation.entityKind] + 1,
    }),
    {meal: 0, activity: 0},
  );
  const badges = new Map<string, OperationalBadge>();
  if (counts.meal > 0) {
    badges.set(CORE_DESTINATION_IDS.meals, {
      label: COPY[locale](counts.meal),
      tone: 'attention',
    });
  }
  if (counts.activity > 0) {
    badges.set(CORE_DESTINATION_IDS.activity, {
      label: COPY[locale](counts.activity),
      tone: 'attention',
    });
  }
  return badges;
};

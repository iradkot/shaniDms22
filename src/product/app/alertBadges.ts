import type {UpdateCenterSnapshot} from '../../modules/alerts';
import {CORE_DESTINATION_IDS} from '../destinations';
import type {DestinationLocale} from '../destinations';
import type {OperationalBadge} from '../hub';

const label = (locale: DestinationLocale, count: number): string =>
  locale === 'he'
    ? `${count} ${count === 1 ? 'עדכון חדש' : 'עדכונים חדשים'}`
    : `${count} new ${count === 1 ? 'update' : 'updates'}`;

/** Projects only actionable unread count; medical content stays in the module. */
export const selectAlertOperationalBadges = (
  snapshot: UpdateCenterSnapshot,
  locale: DestinationLocale,
): ReadonlyMap<string, OperationalBadge> => {
  if (snapshot.status !== 'ready') {
    return new Map();
  }
  const unread = snapshot.items.filter(item => item.readState === 'unread')
    .length;
  return unread === 0
    ? new Map()
    : new Map([
        [
          CORE_DESTINATION_IDS.updateCenter,
          {label: label(locale, unread), tone: 'attention' as const},
        ],
      ]);
};

import type {ActivitySnapshot} from '../../modules/journal';

export type ActivitiesLocale = 'en' | 'he';

export interface ActivityCardViewModel {
  readonly id: ActivitySnapshot['id'];
  readonly title: string;
  readonly timeLabel: string;
  readonly stateLabel: string;
  readonly durationLabel?: string;
  readonly intensityLabel?: string;
  readonly linkedRecordsLabel?: string;
  readonly syncLabel: string;
  readonly syncTone: 'neutral' | 'attention' | 'warning';
  readonly ongoing: boolean;
  readonly tags: readonly string[];
  readonly source: ActivitySnapshot;
}

const COPY = {
  en: {
    categories: {
      walking: 'Walking',
      running: 'Running',
      cycling: 'Cycling',
      strength: 'Strength',
      swimming: 'Swimming',
      sport: 'Sport',
      other: 'Activity',
    },
    intensities: {
      very_low: 'Very light',
      low: 'Light',
      medium: 'Medium',
      high: 'High',
      very_high: 'Very high',
    },
    ongoing: 'In progress',
    finished: 'Finished',
    duration: (minutes: number) => `${minutes} min`,
    links: (count: number) =>
      `${count} linked external ${count === 1 ? 'record' : 'records'}`,
    localOnly: 'Saved on this device',
    pending: 'Waiting to sync',
    syncing: 'Syncing',
    synced: 'Synced',
    failed: 'Sync needs attention',
    conflict: 'Edit conflict',
  },
  he: {
    categories: {
      walking: 'הליכה',
      running: 'ריצה',
      cycling: 'רכיבה',
      strength: 'אימון כוח',
      swimming: 'שחייה',
      sport: 'ספורט',
      other: 'פעילות',
    },
    intensities: {
      very_low: 'קלילה מאוד',
      low: 'קלילה',
      medium: 'בינונית',
      high: 'גבוהה',
      very_high: 'גבוהה מאוד',
    },
    ongoing: 'בתהליך',
    finished: 'הסתיימה',
    duration: (minutes: number) => `${minutes} דק׳`,
    links: (count: number) =>
      `${count} ${
        count === 1 ? 'רשומה חיצונית מקושרת' : 'רשומות חיצוניות מקושרות'
      }`,
    localOnly: 'נשמר במכשיר',
    pending: 'ממתין לסנכרון',
    syncing: 'מסתנכרן',
    synced: 'סונכרן',
    failed: 'הסנכרון דורש תשומת לב',
    conflict: 'יש התנגשות בעריכה',
  },
} as const;

const syncCopy = (
  activity: ActivitySnapshot,
  locale: ActivitiesLocale,
): Pick<ActivityCardViewModel, 'syncLabel' | 'syncTone'> => {
  const copy = COPY[locale];
  switch (activity.syncState.kind) {
    case 'local_only':
      return {syncLabel: copy.localOnly, syncTone: 'neutral'};
    case 'pending':
      return {syncLabel: copy.pending, syncTone: 'attention'};
    case 'syncing':
      return {syncLabel: copy.syncing, syncTone: 'attention'};
    case 'synced':
      return {syncLabel: copy.synced, syncTone: 'neutral'};
    case 'failed':
      return {syncLabel: copy.failed, syncTone: 'warning'};
    case 'conflict':
      return {syncLabel: copy.conflict, syncTone: 'warning'};
  }
};

export const selectActivityCard = (
  activity: ActivitySnapshot,
  locale: ActivitiesLocale,
  formatTime: (timestamp: number) => string,
  now: number,
): ActivityCardViewModel => {
  const copy = COPY[locale];
  const ongoing = activity.endedAt === undefined;
  const elapsedUntil = activity.endedAt ?? Math.max(now, activity.startedAt);
  const minutes = Math.max(
    0,
    Math.round((elapsedUntil - activity.startedAt) / 60_000),
  );
  const linkedCount = activity.externalLinks.length;

  return {
    id: activity.id,
    title:
      activity.category === 'other' && activity.customName
        ? activity.customName
        : copy.categories[activity.category],
    timeLabel: formatTime(activity.startedAt),
    stateLabel: ongoing ? copy.ongoing : copy.finished,
    ...(minutes === 0 ? {} : {durationLabel: copy.duration(minutes)}),
    ...(activity.intensity === undefined
      ? {}
      : {intensityLabel: copy.intensities[activity.intensity]}),
    ...(linkedCount === 0 ? {} : {linkedRecordsLabel: copy.links(linkedCount)}),
    ...syncCopy(activity, locale),
    ongoing,
    tags: activity.tags,
    source: activity,
  };
};

export const selectActivityCards = (
  activities: readonly ActivitySnapshot[],
  locale: ActivitiesLocale,
  formatTime: (timestamp: number) => string,
  now: number,
): readonly ActivityCardViewModel[] =>
  activities.map(activity =>
    selectActivityCard(activity, locale, formatTime, now),
  );

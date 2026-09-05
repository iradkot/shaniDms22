import type {MealSnapshot} from '../../modules/journal';

export type MealsLocale = 'en' | 'he';

export interface MealCardViewModel {
  readonly id: MealSnapshot['id'];
  readonly title: string;
  readonly timeLabel: string;
  readonly mealCarbohydratesLabel?: string;
  readonly reportedCarbohydratesLabel?: string;
  readonly linkedRecordsLabel?: string;
  readonly syncLabel: string;
  readonly syncTone: 'neutral' | 'attention' | 'warning';
  readonly tags: readonly string[];
  readonly source: MealSnapshot;
}

const COPY = {
  en: {
    fallbackTitle: 'Meal',
    mealCarbs: (grams: number) => `Meal carbohydrates: ${grams} g`,
    reportedCarbs: (grams: number | null) =>
      grams === null
        ? 'Reported carbohydrates: incomplete'
        : `Reported to Loop: ${grams} g`,
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
    fallbackTitle: 'ארוחה',
    mealCarbs: (grams: number) => `פחמימות בארוחה: ${grams} גר׳`,
    reportedCarbs: (grams: number | null) =>
      grams === null ? 'פחמימות שדווחו: מידע חלקי' : `דווח ללופ: ${grams} גר׳`,
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
  meal: MealSnapshot,
  locale: MealsLocale,
): Pick<MealCardViewModel, 'syncLabel' | 'syncTone'> => {
  const copy = COPY[locale];
  switch (meal.syncState.kind) {
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

export const selectMealCard = (
  meal: MealSnapshot,
  locale: MealsLocale,
  formatTime: (timestamp: number) => string,
): MealCardViewModel => {
  const copy = COPY[locale];
  const linkedCount = meal.externalLinks.length;
  return {
    id: meal.id,
    title: meal.name ?? copy.fallbackTitle,
    timeLabel: formatTime(meal.mealStart),
    ...(meal.mealCarbohydrates === undefined
      ? {}
      : {
          mealCarbohydratesLabel: copy.mealCarbs(meal.mealCarbohydrates.grams),
        }),
    ...(meal.reportedCarbohydrates === undefined
      ? {}
      : {
          reportedCarbohydratesLabel: copy.reportedCarbs(
            meal.reportedCarbohydrates.totalGrams,
          ),
        }),
    ...(linkedCount === 0 ? {} : {linkedRecordsLabel: copy.links(linkedCount)}),
    ...syncCopy(meal, locale),
    tags: meal.tags,
    source: meal,
  };
};

export const selectMealCards = (
  meals: readonly MealSnapshot[],
  locale: MealsLocale,
  formatTime: (timestamp: number) => string,
): readonly MealCardViewModel[] =>
  meals.map(meal => selectMealCard(meal, locale, formatTime));

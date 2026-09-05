import {
  parseActivityEntryId,
  parseMealEntryId,
  parseRevision,
} from '../../src/modules/journal';
import type {
  ActivitySnapshot,
  MealSnapshot,
  ParseResult,
} from '../../src/modules/journal';
import {
  activityDraftFromSnapshot,
  buildActivityCapture,
  buildActivityRevision,
} from '../../src/product/activities';
import {
  buildMealCapture,
  buildMealRevision,
  mealDraftFromSnapshot,
} from '../../src/product/meals';
import {
  formatJournalDateTime,
  parseJournalDateTime,
  parseJournalTags,
} from '../../src/product/journal';

const valueOf = <T>(result: ParseResult<T>): T => {
  if (!result.ok) {
    throw new Error('Invalid fixture value.');
  }
  return result.value;
};

const timestamp = new Date(2026, 7, 30, 14, 5, 0, 0).getTime();

const meal = (): MealSnapshot => ({
  kind: 'meal',
  id: valueOf(parseMealEntryId('meal-forms-1')),
  scope: {
    productUserId: 'user-1' as MealSnapshot['scope']['productUserId'],
    workspaceId: 'workspace-1' as MealSnapshot['scope']['workspaceId'],
    nightscoutSourceId:
      'nightscout-1' as MealSnapshot['scope']['nightscoutSourceId'],
  },
  revision: valueOf(parseRevision(4)),
  createdAt: timestamp,
  updatedAt: timestamp,
  lifecycle: {kind: 'active'},
  syncState: {kind: 'local_only'},
  mealStart: timestamp,
  name: 'Pasta',
  mealCarbohydrates: {kind: 'meal_carbohydrates', grams: 45},
  notes: 'Before training',
  tags: ['Dinner'],
  externalLinks: [],
});

const activity = (): ActivitySnapshot => ({
  kind: 'activity',
  id: valueOf(parseActivityEntryId('activity-forms-1')),
  scope: meal().scope,
  revision: valueOf(parseRevision(3)),
  createdAt: timestamp,
  updatedAt: timestamp,
  lifecycle: {kind: 'active'},
  syncState: {kind: 'local_only'},
  category: 'walking',
  startedAt: timestamp,
  endedAt: timestamp + 30 * 60_000,
  intensity: 'medium',
  notes: 'Park',
  tags: ['Outside'],
  externalLinks: [],
});

describe('Journal product form interfaces', () => {
  it('round-trips a local minute without silently changing the time', () => {
    const formatted = formatJournalDateTime(timestamp);

    expect(formatted).toBe('2026-08-30 14:05');
    expect(parseJournalDateTime(formatted)).toBe(timestamp);
    expect(parseJournalDateTime('2026-02-30 14:05')).toBeUndefined();
  });

  it('normalizes comma-separated tags without submitting duplicates', () => {
    expect(parseJournalTags(' Dinner, school, dinner ,  ')).toEqual([
      'Dinner',
      'school',
    ]);
  });

  it('builds only changed meal fields and keeps Meal Carbohydrates local', () => {
    const source = meal();
    const draft = {
      ...mealDraftFromSnapshot(source),
      mealCarbohydrates: '50',
      notes: '',
    };

    expect(buildMealRevision(source, source.revision, draft)).toEqual({
      ok: true,
      value: {
        mealId: source.id,
        expectedRevision: source.revision,
        mealCarbohydrates: {
          kind: 'set',
          value: {kind: 'meal_carbohydrates', grams: 50},
        },
        notes: {kind: 'clear'},
      },
    });
  });

  it('rejects an empty meal and accepts an offline-first capture', () => {
    expect(
      buildMealCapture({
        mealStart: formatJournalDateTime(timestamp),
        name: '',
        mealCarbohydrates: '',
        notes: '',
        tags: '',
      }),
    ).toMatchObject({ok: false, reason: 'meal_required'});

    expect(
      buildMealCapture({
        mealStart: formatJournalDateTime(timestamp),
        name: 'Snack',
        mealCarbohydrates: '12.5',
        notes: 'After school',
        tags: 'snack, school',
      }),
    ).toEqual({
      ok: true,
      value: {
        mealStart: timestamp,
        name: 'Snack',
        mealCarbohydrates: {
          kind: 'meal_carbohydrates',
          grams: 12.5,
        },
        notes: 'After school',
        tags: ['snack', 'school'],
      },
    });

    expect(
      buildMealCapture({
        mealStart: formatJournalDateTime(timestamp),
        name: '',
        mealCarbohydrates: '',
        notes: '',
        tags: '',
        image: {
          uri: 'file:///picker/meal.jpg',
          mimeType: 'image/jpeg',
          byteSize: 250_000,
        },
      }),
    ).toEqual({
      ok: true,
      value: {
        mealStart: timestamp,
        image: {
          uri: 'file:///picker/meal.jpg',
          mimeType: 'image/jpeg',
          byteSize: 250_000,
        },
        tags: [],
      },
    });
  });

  it('builds explicit Meal Image set and clear revisions', () => {
    const source = meal();
    const selected = {
      uri: 'file:///picker/new.jpg',
      mimeType: 'image/jpeg',
    };
    expect(
      buildMealRevision(source, source.revision, {
        ...mealDraftFromSnapshot(source),
        image: selected,
      }),
    ).toMatchObject({
      ok: true,
      value: {image: {kind: 'set', value: selected}},
    });

    const withImage: MealSnapshot = {
      ...source,
      image: {
        mimeType: 'image/jpeg',
        syncState: {kind: 'local_only', localUri: 'file:///saved.jpg'},
      },
    };
    expect(
      buildMealRevision(withImage, withImage.revision, {
        ...mealDraftFromSnapshot(withImage),
        image: null,
      }),
    ).toMatchObject({
      ok: true,
      value: {image: {kind: 'clear'}},
    });
  });

  it('keeps activity start and end explicit and can revise to ongoing', () => {
    const source = activity();
    const draft = {
      ...activityDraftFromSnapshot(source),
      ongoing: true,
      category: 'other' as const,
      customName: 'Pilates',
      intensity: undefined,
    };

    expect(buildActivityRevision(source, source.revision, draft)).toEqual({
      ok: true,
      value: {
        activityId: source.id,
        expectedRevision: source.revision,
        category: {kind: 'set', value: 'other'},
        customName: {kind: 'set', value: 'Pilates'},
        endedAt: {kind: 'clear'},
        intensity: {kind: 'clear'},
      },
    });
  });

  it('validates activity time order and custom names', () => {
    const base = {
      category: 'other' as const,
      customName: '',
      startedAt: formatJournalDateTime(timestamp),
      endedAt: formatJournalDateTime(timestamp - 60_000),
      ongoing: false,
      intensity: undefined,
      notes: '',
      tags: '',
    };

    expect(buildActivityCapture(base)).toMatchObject({
      ok: false,
      reason: 'custom_name_required',
    });
    expect(buildActivityCapture({...base, customName: 'Yoga'})).toMatchObject({
      ok: false,
      reason: 'time_order',
    });
  });
});

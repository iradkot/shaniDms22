import {
  parseMealEntryId,
  parseNightscoutSourceId,
  parseProductUserId,
  parseRevision,
  parseWorkspaceId,
} from '../../src/modules/journal';
import type {MealSnapshot, ParseResult} from '../../src/modules/journal';
import {selectMealCard} from '../../src/product/meals';

const valueOf = <T>(result: ParseResult<T>): T => {
  if (!result.ok) {
    throw new Error('Invalid test value.');
  }
  return result.value;
};

const meal = (overrides: Partial<MealSnapshot> = {}): MealSnapshot => ({
  kind: 'meal',
  id: valueOf(parseMealEntryId('meal-1')),
  scope: {
    productUserId: valueOf(parseProductUserId('user-1')),
    workspaceId: valueOf(parseWorkspaceId('workspace-1')),
    nightscoutSourceId: valueOf(parseNightscoutSourceId('nightscout-1')),
  },
  revision: valueOf(parseRevision(1)),
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  lifecycle: {kind: 'active'},
  syncState: {kind: 'pending', queuedAt: 1_700_000_000_000, operationCount: 1},
  mealStart: 1_700_000_000_000,
  name: 'Pasta',
  mealCarbohydrates: {kind: 'meal_carbohydrates', grams: 45},
  tags: ['dinner'],
  externalLinks: [],
  ...overrides,
});

describe('Meals presentation selectors', () => {
  it('keeps Meal Carbohydrates separate from Reported Carbohydrates', () => {
    const card = selectMealCard(
      meal({
        reportedCarbohydrates: {
          kind: 'reported_carbohydrates',
          totalGrams: 35,
          componentCount: 2,
          knownComponentCount: 2,
          stale: false,
          components: [],
        },
      }),
      'en',
      () => '20:15',
    );

    expect(card.mealCarbohydratesLabel).toBe('Meal carbohydrates: 45 g');
    expect(card.reportedCarbohydratesLabel).toBe('Reported to Loop: 35 g');
    expect(card.syncLabel).toBe('Waiting to sync');
  });

  it('uses clear Hebrew copy without turning status into a score', () => {
    const unnamed = {...meal()};
    delete unnamed.name;
    const card = selectMealCard(unnamed, 'he', () => '20:15');

    expect(card.title).toBe('ארוחה');
    expect(card.syncLabel).toBe('ממתין לסנכרון');
    expect(card).not.toHaveProperty('score');
  });
});

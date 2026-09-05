import {
  buildMealImageObjectPath,
  isManagedMealImageObjectPath,
  parseMealImageObjectPath,
} from '../../../src/modules/mealMedia';
import {
  parseMealEntryId,
  parseNightscoutSourceId,
  parseProductUserId,
  parseWorkspaceId,
  type JournalWorkspaceScope,
} from '../../../src/modules/journal';

const valueOf = <T,>(result: {ok: true; value: T} | {ok: false}): T => {
  if (!result.ok) {
    throw new Error('Invalid fixture.');
  }
  return result.value;
};

const scope: JournalWorkspaceScope = {
  productUserId: valueOf(parseProductUserId('owner-1')),
  workspaceId: valueOf(parseWorkspaceId('workspace-1')),
  nightscoutSourceId: valueOf(parseNightscoutSourceId('source-1')),
};

describe('Meal Image object paths', () => {
  it('round-trips an exact owner and Workspace-scoped path', () => {
    const objectPath = buildMealImageObjectPath(
      scope,
      valueOf(parseMealEntryId('meal-1')),
      'image_1234567890abcdef1234567890abcdef.jpg',
    );

    expect(parseMealImageObjectPath(objectPath)).toEqual({
      productUserId: 'owner-1',
      workspaceId: 'workspace-1',
      mealId: 'meal-1',
      objectName: 'image_1234567890abcdef1234567890abcdef.jpg',
    });
    expect(isManagedMealImageObjectPath(scope, objectPath)).toBe(true);
  });

  it('rejects cross-scope, prefix-collision and nested paths', () => {
    const base =
      'users/owner-1/workspaces/workspace-1/mealImages/meal-1/image_1234567890abcdef1234567890abcdef.jpg';
    expect(
      isManagedMealImageObjectPath(
        {...scope, workspaceId: valueOf(parseWorkspaceId('workspace-2'))},
        base,
      ),
    ).toBe(false);
    expect(
      parseMealImageObjectPath(base.replace('workspace-1', 'workspace-1/extra')),
    ).toBeUndefined();
    expect(parseMealImageObjectPath(`${base}/nested`)).toBeUndefined();
  });
});

import {
  DurableMealImageDeletionQueue,
  type MealImageStringStore,
} from '../../../src/modules/mealMedia';

const FIRST =
  'users/owner-1/workspaces/workspace-1/mealImages/meal-1/image_1234567890abcdef1234567890abcdef.jpg';
const SECOND =
  'users/owner-1/workspaces/workspace-1/mealImages/meal-2/image_abcdef1234567890abcdef1234567890.png';

class MemoryStrings implements MealImageStringStore {
  value: string | null = null;
  async getItem() {
    return this.value;
  }
  async setItem(_key: string, value: string) {
    this.value = value;
  }
}

describe('durable Meal Image deletion queue', () => {
  it('persists unique safe paths before deletion and survives restart', async () => {
    const strings = new MemoryStrings();
    const queue = new DurableMealImageDeletionQueue(strings);

    await queue.enqueue(FIRST);
    await queue.enqueue(FIRST);
    await queue.enqueue(SECOND);

    await expect(
      new DurableMealImageDeletionQueue(strings).getSnapshot(),
    ).resolves.toEqual([FIRST, SECOND]);
    await expect(queue.enqueue('../unsafe.jpg')).rejects.toThrow('path');
  });

  it('removes successful paths and retains failures for a later retry', async () => {
    const strings = new MemoryStrings();
    const queue = new DurableMealImageDeletionQueue(strings);
    await queue.enqueue(FIRST);
    await queue.enqueue(SECOND);
    const attempts: string[] = [];

    await expect(
      queue.flush(async path => {
        attempts.push(path);
        if (path === SECOND) {
          throw new Error('offline');
        }
      }),
    ).resolves.toEqual({removed: 1, pending: 1});
    expect(attempts).toEqual([FIRST, SECOND]);
    await expect(queue.getSnapshot()).resolves.toEqual([SECOND]);

    await expect(queue.flush(async () => undefined)).resolves.toEqual({
      removed: 1,
      pending: 0,
    });
  });

  it('drops malformed persisted data without ever deleting an unsafe path', async () => {
    const strings = new MemoryStrings();
    strings.value = JSON.stringify({schemaVersion: 1, objectPaths: [FIRST, '../x']});
    const queue = new DurableMealImageDeletionQueue(strings);
    const removals: string[] = [];

    await expect(
      queue.flush(async path => {
        removals.push(path);
      }),
    ).resolves.toEqual({
      removed: 0,
      pending: 0,
    });
    expect(removals).toEqual([]);
  });
});

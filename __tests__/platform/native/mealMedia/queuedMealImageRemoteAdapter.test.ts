import {
  DurableMealImageDeletionQueue,
  type MealImageRemoteAdapter,
  type MealImageStringStore,
} from '../../../../src/modules/mealMedia';
import {createQueuedMealImageRemoteAdapter} from '../../../../src/platform/native/mealMedia/queuedMealImageRemoteAdapter';

const OBJECT_PATH =
  'users/owner-1/workspaces/workspace-1/mealImages/meal-1/image_1234567890abcdef1234567890abcdef.jpg';

class MemoryStrings implements MealImageStringStore {
  value: string | null = null;
  async getItem() {
    return this.value;
  }
  async setItem(_key: string, value: string) {
    this.value = value;
  }
}

describe('queued Meal Image remote adapter', () => {
  it('accepts deletion locally and retries the durable remote cleanup later', async () => {
    const strings = new MemoryStrings();
    const queue = new DurableMealImageDeletionQueue(strings);
    let offline = true;
    const delegate: MealImageRemoteAdapter = {
      upload: jest.fn().mockResolvedValue({ok: true}),
      resolve: jest.fn().mockResolvedValue('https://example.test/image'),
      remove: jest.fn(async () => {
        if (offline) {
          throw new Error('offline');
        }
      }),
    };
    const queued = createQueuedMealImageRemoteAdapter(delegate, queue);

    await expect(queued.adapter.remove(OBJECT_PATH)).resolves.toBeUndefined();
    await expect(queue.getSnapshot()).resolves.toEqual([OBJECT_PATH]);

    offline = false;
    await expect(queued.retryPendingDeletions()).resolves.toEqual({
      removed: 1,
      pending: 0,
    });
    await expect(queue.getSnapshot()).resolves.toEqual([]);
  });

  it('attempts pending cleanup before a new upload', async () => {
    const queue = new DurableMealImageDeletionQueue(new MemoryStrings());
    await queue.enqueue(OBJECT_PATH);
    const order: string[] = [];
    const delegate: MealImageRemoteAdapter = {
      async upload() {
        order.push('upload');
        return {ok: true};
      },
      async resolve() {
        return 'https://example.test/image';
      },
      async remove() {
        order.push('remove');
      },
    };
    const queued = createQueuedMealImageRemoteAdapter(delegate, queue);

    await queued.adapter.upload({
      objectPath: OBJECT_PATH,
      localUri: 'file:///documents/image.jpg',
      mimeType: 'image/jpeg',
    });

    expect(order).toEqual(['remove', 'upload']);
  });
});

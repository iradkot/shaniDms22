import type {
  DurableMealImageDeletionQueue,
  MealImageRemoteAdapter,
} from '../../../modules/mealMedia';

export const createQueuedMealImageRemoteAdapter = (
  delegate: MealImageRemoteAdapter,
  queue: DurableMealImageDeletionQueue,
): {
  readonly adapter: MealImageRemoteAdapter;
  readonly retryPendingDeletions: () => Promise<{
    readonly removed: number;
    readonly pending: number;
  }>;
} => {
  const retryPendingDeletions = () =>
    queue.flush(objectPath => delegate.remove(objectPath));
  return {
    retryPendingDeletions,
    adapter: {
      async upload(input) {
        await retryPendingDeletions().catch(() => undefined);
        return delegate.upload(input);
      },
      resolve: objectPath => delegate.resolve(objectPath),
      async remove(objectPath) {
        // Queue first so a process termination cannot lose the cleanup intent.
        await queue.enqueue(objectPath);
        await retryPendingDeletions().catch(() => undefined);
      },
    },
  };
};

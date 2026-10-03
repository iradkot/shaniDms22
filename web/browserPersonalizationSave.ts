import {
  resolveProductPersonalizationChange,
  type OfflineFirstProductPersonalizationRepository,
  type ProductPersonalizationChange,
  type ProductPersonalizationSyncScope,
  type StoredProductPersonalization,
} from '../src/product/personalization';

type PersonalizationRepository = Pick<
  OfflineFirstProductPersonalizationRepository,
  'open' | 'save' | 'synchronize'
>;

/** A local write may finish after navigation, but may publish only to its owner. */
export function queueBrowserPersonalizationSave(input: {
  readonly repository: PersonalizationRepository;
  readonly scope: ProductPersonalizationSyncScope;
  readonly change: ProductPersonalizationChange;
  readonly writeTail: {current: Promise<void>};
  readonly revision: {current: number};
  readonly isCurrentScope: () => boolean;
  readonly publish: (value: StoredProductPersonalization) => void;
}): Promise<void> {
  const revision = ++input.revision.current;
  const run = input.writeTail.current.then(async () => {
    // Read the captured account's durable baseline, never another session's ref.
    const current = await input.repository.open(input.scope);
    const desired = resolveProductPersonalizationChange(current, input.change);
    const persisted = await input.repository.save(
      input.scope,
      current,
      desired,
    );
    if (!input.isCurrentScope()) {
      return;
    }
    // All browser saves publish after persistence, including optimistic:false.
    input.publish(persisted);
    // Cloud work never holds up the local save or later edits. A later queued
    // write invalidates this publication even within the same account.
    input.repository
      .synchronize(input.scope)
      .then(result => {
        if (input.isCurrentScope() && input.revision.current === revision) {
          input.publish(result.preferences);
        }
      })
      .catch(() => undefined);
  });
  input.writeTail.current = run.catch(() => undefined);
  return run;
}

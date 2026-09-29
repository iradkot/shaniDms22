import {buildCurrentDataSnapshot} from './snapshot';
import type {
  CurrentDataSource,
  CurrentDataSourceDependencies,
  CurrentReadResult,
} from './types';

const cancelled = (): Error =>
  Object.assign(new Error('Current data read cancelled.'), {
    name: 'AbortError',
  });
const withSignal = <T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(cancelled());
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(cancelled());
    signal.addEventListener('abort', abort, {once: true});
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
};

/** Independent latest reads. No history, treatment, profile, or native runtime dependency. */
export const createCurrentDataSource = (
  dependencies: CurrentDataSourceDependencies,
): CurrentDataSource => {
  const now = dependencies.now ?? (() => Date.now());
  let lastScope: string | undefined;
  let generation = 0;
  let pending:
    | Promise<readonly [CurrentReadResult | null, CurrentReadResult | null]>
    | undefined;
  return {
    async loadCurrent(input) {
      if (input?.signal?.aborted) {
        throw cancelled();
      }
      const scope = dependencies.getScopeKey();
      if (scope !== lastScope) {
        lastScope = scope;
        generation += 1;
        pending = undefined;
      }
      const requestedGeneration = generation;
      const assertCurrent = () => {
        if (
          scope !== dependencies.getScopeKey() ||
          generation !== requestedGeneration
        ) {
          throw new Error('Current data source changed during loading.');
        }
      };
      if (!pending) {
        const work = Promise.allSettled([
          Promise.resolve().then(dependencies.readGlucose),
          Promise.resolve().then(dependencies.readDeviceStatus),
        ]).then(results => {
          assertCurrent();
          const [glucose, deviceStatus] = results;
          return [
            glucose.status === 'fulfilled' ? glucose.value : null,
            deviceStatus.status === 'fulfilled' ? deviceStatus.value : null,
          ] as const;
        });
        pending = work;
        work
          .finally(() => {
            if (pending === work) {
              pending = undefined;
            }
          })
          .catch(() => {});
      }
      const [glucose, deviceStatus] = await withSignal(pending, input?.signal);
      assertCurrent();
      return buildCurrentDataSnapshot({
        observedAtMs: now(),
        glucose,
        deviceStatus,
      });
    },
  };
};

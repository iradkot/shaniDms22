import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  getNightscoutConfigurationRevision,
  subscribeNightscoutConfiguration,
} from 'app/api/shaniNightscoutInstances';
import {
  loadInsulinContext,
  type InsulinContext,
} from 'app/services/insulin/insulinDataSource';

const unavailable: InsulinContext['availability'] = {
  treatments: 'unavailable',
  profile: 'unavailable',
  deviceStatus: 'unavailable',
};

/** React facade over the same source used by native charts and AI evidence. */
export const useInsulinData = (date: Date) => {
  const revision = useSyncExternalStore(
    subscribeNightscoutConfiguration,
    getNightscoutConfigurationRevision,
    getNightscoutConfigurationRevision,
  );
  const dateMs = date.getTime();
  const period = useMemo(() => {
    const start = new Date(dateMs);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {startMs: start.getTime(), endMs: end.getTime()};
  }, [dateMs]);
  const [context, setContext] = useState<InsulinContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  useLayoutEffect(() => {
    generation.current += 1;
    setContext(null);
    setError(null);
    return () => {
      generation.current += 1;
    };
  }, [period, revision]);

  const load = useCallback(
    async (forceRefresh: boolean) => {
      if (revision !== getNightscoutConfigurationRevision()) {
        return;
      }
      const request = ++generation.current;
      setIsLoading(true);
      setError(null);
      try {
        const next = await loadInsulinContext({...period, forceRefresh});
        if (
          request !== generation.current ||
          revision !== getNightscoutConfigurationRevision()
        ) {
          return;
        }
        setContext(next);
        if (Object.values(next.availability).includes('unavailable')) {
          setError('Some insulin context could not be loaded.');
        }
      } catch {
        if (request === generation.current) {
          setError('Insulin context could not be loaded.');
        }
      } finally {
        if (request === generation.current) {
          setIsLoading(false);
        }
      }
    },
    [period, revision],
  );

  useEffect(() => {
    load(false);
  }, [load]);
  const getUpdatedInsulinData = useCallback(() => load(true), [load]);

  return {
    insulinData: context?.insulinData ?? [],
    basalProfileData: context?.basalProfileData ?? [],
    carbTreatments: context?.carbTreatments ?? [],
    deviceStatus: context?.deviceStatus ?? [],
    loadSamples: context?.loadSamples ?? [],
    availability: context?.availability ?? unavailable,
    isLoading,
    error,
    getUpdatedInsulinData,
  };
};

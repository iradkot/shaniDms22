// /Trends/hooks/useTrendsData.ts

import { useState, useEffect, useRef } from 'react';
import { BgSample } from 'app/types/day_bgs.types';
import { fetchBgDataForDateRange } from 'app/api/apiRequests';
import { calculateTrendsMetrics } from '../utils/trendsCalculations';
import { loadingSteps, CHUNK_SIZE, WARNING_TIME, MAX_LOADING_TIME } from '../Trends.constants';

interface UseTrendsDataProps {
  rangeDays: number;
  start: Date;
  end: Date;
}

export function useTrendsData({ rangeDays, start, end }: UseTrendsDataProps) {
  const [bgData, setBgData] = useState<BgSample[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [daysFetched, setDaysFetched] = useState(0);
  const [fetchCancelled, setFetchCancelled] = useState(false);

  // Keep partial metrics if user cancels mid-fetch
  const [partialMetrics, setPartialMetrics] = useState(() => calculateTrendsMetrics([]));

  // For rotating "fetching" messages
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const loadingStartTime = useRef<number | null>(null);

  // Main effect to fetch data in CHUNK_SIZE increments
  useEffect(() => {
    let isMounted = true;

    async function fetchInChunks() {
      setIsLoading(true);
      setFetchError(null);
      setBgData([]);
      setDaysFetched(0);
      setFetchCancelled(false);
      loadingStartTime.current = Date.now();

      const totalChunks = Math.ceil(rangeDays / CHUNK_SIZE);
      let allData: BgSample[] = [];

      try {
        for (let i = 0; i < totalChunks; i++) {
          if (!isMounted || fetchCancelled) break;

          const chunkStart = new Date(start);
          chunkStart.setDate(start.getDate() + i * CHUNK_SIZE);

          const chunkEnd = new Date(chunkStart);
          chunkEnd.setDate(chunkStart.getDate() + CHUNK_SIZE - 1);
          if (chunkEnd > end) chunkEnd.setTime(end.getTime());

          // Perform the fetch
          const dataChunk = await fetchBgDataForDateRange(chunkStart, chunkEnd);
          allData = allData.concat(dataChunk);

          // Update state after each chunk
          if (!isMounted) return;
          setBgData([...allData]);
          setDaysFetched(Math.min((i + 1) * CHUNK_SIZE, rangeDays));

          // Keep partial metrics
          const partial = calculateTrendsMetrics(allData);
          setPartialMetrics(partial);
        }
      } catch (e: any) {
        if (isMounted) setFetchError(e.message || 'Failed to fetch data');
      } finally {
        if (isMounted && !fetchCancelled) {
          setIsLoading(false);
        }
      }
    }
    fetchInChunks();

    return () => {
      isMounted = false;
    };
  }, [rangeDays, start, end]);

  // Rotate the loading step index
  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setLoadingStepIndex(prev => (prev + 1) % loadingSteps.length);
      }, 2000);
      return () => clearInterval(interval);
    } else {
      setLoadingStepIndex(0);
      loadingStartTime.current = null;
    }
  }, [isLoading]);

  // Cancel button
  const cancelFetch = () => {
    setFetchCancelled(true);
    setIsLoading(false);
  };

  // Some computed states
  const loadingTime = loadingStartTime.current ? (Date.now() - loadingStartTime.current) : 0;
  const showLongWaitWarning = isLoading && !fetchCancelled && !fetchError
    && loadingTime > WARNING_TIME && loadingTime < MAX_LOADING_TIME;
  const showMaxWaitReached = isLoading && !fetchCancelled && !fetchError
    && loadingTime >= MAX_LOADING_TIME;

  // Final or partial metrics
  const finalMetrics = fetchCancelled ? partialMetrics : calculateTrendsMetrics(bgData);

  return {
    bgData,
    isLoading,
    fetchError,
    daysFetched,
    fetchCancelled,
    loadingStepIndex,
    cancelFetch,
    showLongWaitWarning,
    showMaxWaitReached,
    finalMetrics,
  };
}

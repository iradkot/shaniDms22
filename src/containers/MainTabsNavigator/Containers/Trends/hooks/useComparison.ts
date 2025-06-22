// Custom hook for handling comparison logic

import { useState } from 'react';
import { fetchBgDataForDateRange } from 'app/api/apiRequests';
import { calculateTrendsMetrics } from '../utils/trendsCalculations';
import { CHUNK_SIZE } from '../Trends.constants';
import { BgSample } from 'app/types/day_bgs.types';
import { DateRange } from '../types/trends.types';

interface UseComparisonProps {
  start: Date;
  rangeDays: number;
}

export function useComparison({ start, rangeDays }: UseComparisonProps) {
  const [showComparison, setShowComparison] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [previousMetrics, setPreviousMetrics] = useState<ReturnType<typeof calculateTrendsMetrics> | null>(null);
  const [comparisonOffset, setComparisonOffset] = useState(rangeDays);
  const [comparisonDateRange, setComparisonDateRange] = useState<DateRange | null>(null);

  const handleCompare = async (offset = rangeDays) => {
    setComparing(true);
    setPreviousMetrics(null);

    try {
      const previousStart = new Date(start);
      previousStart.setDate(start.getDate() - offset);
      previousStart.setHours(0, 0, 0, 0);

      const previousEnd = new Date(previousStart);
      previousEnd.setHours(23, 59, 59, 999);
      previousEnd.setDate(previousStart.getDate() + (rangeDays - 1));

      setComparisonDateRange({ start: previousStart, end: previousEnd });

      // Fetch data in chunks, similar to useTrendsData
      const totalChunks = Math.ceil(rangeDays / CHUNK_SIZE);
      let previousBgData: BgSample[] = [];

      for (let i = 0; i < totalChunks; i++) {
        const chunkStart = new Date(previousStart);
        chunkStart.setDate(previousStart.getDate() + i * CHUNK_SIZE);

        const chunkEnd = new Date(chunkStart);
        chunkEnd.setDate(chunkStart.getDate() + CHUNK_SIZE - 1);
        if (chunkEnd > previousEnd) chunkEnd.setTime(previousEnd.getTime());

        const dataChunk = await fetchBgDataForDateRange(chunkStart, chunkEnd);
        previousBgData = previousBgData.concat(dataChunk);
      }

      const metrics = calculateTrendsMetrics(previousBgData);
      setPreviousMetrics(metrics);
      setShowComparison(true);
    } catch (e: any) {
      console.log('Failed to compare previous period:', e.message);
      // Optionally, handle the error in the UI
    } finally {
      setComparing(false);
    }
  };

  const changeComparisonPeriod = (direction: 'back' | 'forward') => {
    const newOffset =
      direction === 'back'
        ? comparisonOffset + rangeDays
        : Math.max(rangeDays, comparisonOffset - rangeDays);
    setComparisonOffset(newOffset);
    handleCompare(newOffset);
  };

  const hideComparison = () => setShowComparison(false);

  return {
    showComparison,
    comparing,
    previousMetrics,
    comparisonOffset,
    comparisonDateRange,
    handleCompare,
    changeComparisonPeriod,
    hideComparison
  };
}

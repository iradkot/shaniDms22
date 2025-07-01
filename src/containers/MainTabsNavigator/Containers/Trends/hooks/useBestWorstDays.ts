// Custom hook for best/worst day selection and ranking

import { useState } from 'react';
import { DayDetail } from '../utils/trendsCalculations';
import { rankDaysByMetric, getBestWorstDayStrings } from '../utils/dayRanking.utils';
import { MetricType } from '../types/trends.types';

interface UseBestWorstDaysProps {
  dailyDetails: DayDetail[];
}

export function useBestWorstDays({ dailyDetails }: UseBestWorstDaysProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('tir');

  const { bestDayDetail, worstDayDetail } = rankDaysByMetric(dailyDetails, selectedMetric);
  const { bestDay, worstDay } = getBestWorstDayStrings(bestDayDetail, worstDayDetail);

  return {
    selectedMetric,
    setSelectedMetric,
    bestDayDetail,
    worstDayDetail,
    bestDay,
    worstDay
  };
}

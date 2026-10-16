import {createContext, useContext, useMemo} from 'react';
import {cgmRange, CGM_STATUS_CODES} from '../../constants/PLAN_CONFIG';
import type {TrendsRangeThresholds} from '../../modules/trends';

/** Shared by the plot and inspector, including the fullscreen chart. */
export const GlucoseChartThresholdsContext = createContext<
  TrendsRangeThresholds | undefined
>(undefined);

export const useGlucoseChartThresholds = (): TrendsRangeThresholds => {
  const supplied = useContext(GlucoseChartThresholdsContext);
  const veryLowMaxMgDl =
    supplied?.veryLowMaxMgDl ??
    (cgmRange[CGM_STATUS_CODES.EXTREME_LOW] as number);
  const targetMinMgDl = supplied?.targetMinMgDl ?? cgmRange.TARGET.min;
  const targetMaxMgDl = supplied?.targetMaxMgDl ?? cgmRange.TARGET.max;
  const highMaxMgDl =
    supplied?.highMaxMgDl ??
    (cgmRange[CGM_STATUS_CODES.EXTREME_HIGH] as number);
  return useMemo(
    () => ({
      veryLowMaxMgDl,
      targetMinMgDl,
      targetMaxMgDl,
      highMaxMgDl,
    }),
    [veryLowMaxMgDl, targetMinMgDl, targetMaxMgDl, highMaxMgDl],
  );
};

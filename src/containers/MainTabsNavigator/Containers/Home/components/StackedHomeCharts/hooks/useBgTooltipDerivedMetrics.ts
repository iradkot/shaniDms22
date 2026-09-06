import {useMemo} from 'react';

import {
  getSampleIobTotal,
  type ChartLoadValues,
} from 'app/utils/chartLoadSeries.utils';

export type BgTooltipDerivedMetrics = {
  activeInsulinU: number | null;
  activeInsulinBolusU: number | null;
  activeInsulinBasalU: number | null;
  cobG: number | null;
};

/**
 * Derives tooltip metrics from the selected load fields, independently of glucose.
 * Legacy callers may still supply an enriched BG sample.
 *
 * We support multiple Nightscout/device-status shapes:
 * - total IOB via `sample.iob`
 * - split IOB via `sample.iobBolus` + `sample.iobBasal`
 *
 * Returns `null` when the source value is missing.
 */
export function useBgTooltipDerivedMetrics(
  bgSample: ChartLoadValues | null,
): BgTooltipDerivedMetrics {
  const activeInsulinU = useMemo(
    () => (bgSample ? getSampleIobTotal(bgSample) : null),
    [bgSample],
  );

  const activeInsulinBolusU = useMemo(() => {
    if (!bgSample) {
      return null;
    }
    const v = bgSample.iobBolus;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }, [bgSample]);

  const activeInsulinBasalU = useMemo(() => {
    if (!bgSample) {
      return null;
    }
    const v = bgSample.iobBasal;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }, [bgSample]);

  const cobG = useMemo(() => {
    if (!bgSample) {
      return null;
    }
    const v = bgSample.cob;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }, [bgSample]);

  return {activeInsulinU, activeInsulinBolusU, activeInsulinBasalU, cobG};
}

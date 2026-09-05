import {useMemo} from 'react';

import type {BgSample} from 'app/types/day_bgs.types';
import {getSampleIobTotal} from 'app/utils/chartLoadSeries.utils';

export type BgTooltipDerivedMetrics = {
  activeInsulinU: number | null;
  activeInsulinBolusU: number | null;
  activeInsulinBasalU: number | null;
  cobG: number | null;
};

/**
 * Derives tooltip-friendly metrics from a focused BG sample.
 *
 * We support multiple Nightscout/device-status shapes:
 * - total IOB via `sample.iob`
 * - split IOB via `sample.iobBolus` + `sample.iobBasal`
 *
 * Returns `null` when the source value is missing.
 */
export function useBgTooltipDerivedMetrics(
  bgSample: BgSample | null,
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

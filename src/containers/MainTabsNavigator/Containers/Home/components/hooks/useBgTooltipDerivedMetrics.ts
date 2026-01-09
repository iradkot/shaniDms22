import {useMemo} from 'react';

import type {BgSample} from 'app/types/day_bgs.types';

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
export function useBgTooltipDerivedMetrics(bgSample: BgSample | null): BgTooltipDerivedMetrics {
  const activeInsulinU = useMemo(() => {
    if (!bgSample) return null;
    if (typeof bgSample.iob === 'number' && Number.isFinite(bgSample.iob)) return bgSample.iob;

    if (
      typeof bgSample.iobBolus === 'number' ||
      typeof bgSample.iobBasal === 'number'
    ) {
      const bolus = typeof bgSample.iobBolus === 'number' && Number.isFinite(bgSample.iobBolus)
        ? bgSample.iobBolus
        : 0;
      const basal = typeof bgSample.iobBasal === 'number' && Number.isFinite(bgSample.iobBasal)
        ? bgSample.iobBasal
        : 0;
      return bolus + basal;
    }

    return null;
  }, [bgSample]);

  const activeInsulinBolusU = useMemo(() => {
    if (!bgSample) return null;
    const v = (bgSample as any).iobBolus;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }, [bgSample]);

  const activeInsulinBasalU = useMemo(() => {
    if (!bgSample) return null;
    const v = (bgSample as any).iobBasal;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }, [bgSample]);

  const cobG = useMemo(() => {
    if (!bgSample) return null;
    const v = (bgSample as any).cob;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }, [bgSample]);

  return {activeInsulinU, activeInsulinBolusU, activeInsulinBasalU, cobG};
}

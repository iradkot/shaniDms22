import {useMemo} from 'react';

export type BolusSummary = {count: number; totalU: number};
export type CarbsSummary = {count: number; totalG: number};

/**
 * Small reusable helper for tooltip summaries.
 *
 * Kept intentionally generic so it can work with both:
 * - CGM graph tooltips (bolus utils / carb utils output)
 * - Home stacked charts tooltip model output
 */
export function useTooltipEventsSummary(params: {
  bolusEvents: Array<{amount: number}>;
  carbEvents: Array<{carbs: number}>;
}): {bolusSummary: BolusSummary; carbsSummary: CarbsSummary} {
  const {bolusEvents, carbEvents} = params;

  const bolusSummary = useMemo(() => {
    const totalU = (bolusEvents ?? []).reduce((acc, e) => {
      const v = (e as any)?.amount;
      return typeof v === 'number' && Number.isFinite(v) ? acc + v : acc;
    }, 0);

    return {count: bolusEvents?.length ?? 0, totalU};
  }, [bolusEvents]);

  const carbsSummary = useMemo(() => {
    const totalG = (carbEvents ?? []).reduce((acc, e) => {
      const v = (e as any)?.carbs;
      return typeof v === 'number' && Number.isFinite(v) ? acc + v : acc;
    }, 0);

    return {count: carbEvents?.length ?? 0, totalG};
  }, [carbEvents]);

  return {bolusSummary, carbsSummary};
}

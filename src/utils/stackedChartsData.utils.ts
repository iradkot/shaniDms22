import {BgSample} from 'app/types/day_bgs.types';
import {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import {FoodItemDTO} from 'app/types/food.types';
import {fetchBgDataForDateRangeUncached} from 'app/api/apiRequests';
import {loadInsulinContext} from 'app/services/insulin/insulinDataSource';
import {mergeLoadSamplesIntoBgSamples} from 'app/utils/mergeDeviceStatusIntoBgSamples.utils';

export type StackedChartsData = {
  bgSamples: BgSample[];
  insulinData: InsulinDataEntry[];
  foodItems: FoodItemDTO[];
  basalProfileData: BasalProfile;
  availability?: Awaited<ReturnType<typeof loadInsulinContext>>['availability'];
};

export type FullScreenStackedChartsParams = {
  mode: 'stackedCharts';
  /** Optional title shown in fullscreen header for this stacked-charts view. */
  title?: string;
  bgSamples: BgSample[];
  foodItems: FoodItemDTO[] | null;
  insulinData?: InsulinDataEntry[];
  basalProfileData?: BasalProfile;
  xDomainMs?: {startMs: number; endMs: number} | null;
  fallbackAnchorTimeMs?: number;
};

export function buildFullScreenStackedChartsParams(params: {
  title?: string;
  bgSamples: BgSample[];
  foodItems: FoodItemDTO[] | null;
  insulinData?: InsulinDataEntry[];
  basalProfileData?: BasalProfile;
  xDomainMs?: {startMs: number; endMs: number} | null;
  fallbackAnchorTimeMs?: number;
}): FullScreenStackedChartsParams {
  return {
    mode: 'stackedCharts',
    bgSamples: params.bgSamples,
    foodItems: params.foodItems,
    ...(params.title !== undefined ? {title: params.title} : {}),
    ...(params.insulinData !== undefined
      ? {insulinData: params.insulinData}
      : {}),
    ...(params.basalProfileData !== undefined
      ? {basalProfileData: params.basalProfileData}
      : {}),
    ...(params.xDomainMs !== undefined ? {xDomainMs: params.xDomainMs} : {}),
    ...(params.fallbackAnchorTimeMs !== undefined
      ? {fallbackAnchorTimeMs: params.fallbackAnchorTimeMs}
      : {}),
  };
}

function estimateCountForRangeMs(
  startMs: number,
  endMs: number,
  perDay: number,
) {
  const ms = Math.max(0, endMs - startMs);
  const days = Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  const estimate = Math.ceil(days * perDay * 1.1);
  return Math.min(100_000, Math.max(500, estimate));
}

function filterBgSamplesToRange(
  bgSamples: BgSample[],
  startMs: number,
  endMs: number,
) {
  if (!bgSamples?.length) return [];
  return bgSamples.filter(
    s => typeof s?.date === 'number' && s.date >= startMs && s.date <= endMs,
  );
}

function sortBgSamplesAsc(bgSamples: BgSample[]) {
  if (!bgSamples?.length) return [];
  return [...bgSamples].sort((a, b) => {
    const ad = typeof a?.date === 'number' ? a.date : 0;
    const bd = typeof b?.date === 'number' ? b.date : 0;
    return ad - bd;
  });
}

/**
 * Heuristic: detect when `existingBgSamples` is too sparse for the requested range.
 *
 * Why:
 * - Some callers (e.g. Trends) may hold downsampled BG data.
 * - If we skip fetching in that case, the chart/tooltip can only show those sparse points.
 */
function isLikelyCompleteBgSetForRange(
  bgSamples: BgSample[],
  startMs: number,
  endMs: number,
) {
  const inRange = filterBgSamplesToRange(bgSamples, startMs, endMs);
  if (!inRange.length) return false;

  const rangeMs = Math.max(0, endMs - startMs);
  // For very short windows, any data is better than over-fetching.
  if (rangeMs <= 15 * 60_000) return true;

  // Expect roughly 5-minute CGM: 288/day. We accept being lower than that
  // because some sources are 1-10 minute; we just want to catch extreme sparsity.
  const expected = Math.max(
    12,
    Math.round((rangeMs / (24 * 60 * 60 * 1000)) * 288),
  );
  return inRange.length >= expected * 0.6;
}

export async function enrichBgSamplesWithDeviceStatusForRange(params: {
  startMs: number;
  endMs: number;
  bgSamples: BgSample[];
}): Promise<BgSample[]> {
  const {startMs, endMs, bgSamples} = params;
  if (!bgSamples?.length) return [];

  try {
    const context = await loadInsulinContext({startMs, endMs});
    return mergeLoadSamplesIntoBgSamples({
      bgSamples,
      loadSamples: context.loadSamples,
    });
  } catch (e) {
    return bgSamples;
  }
}

export async function fetchStackedChartsDataForRange(params: {
  startMs: number;
  endMs: number;
  existingBgSamples?: BgSample[];
  includeDeviceStatus?: boolean;
  includeTreatments?: boolean;
  includeProfile?: boolean;
}): Promise<StackedChartsData> {
  const {
    startMs,
    endMs,
    existingBgSamples,
    includeDeviceStatus = true,
    includeTreatments = true,
    includeProfile = true,
  } = params;

  const result: StackedChartsData = {
    bgSamples: [],
    insulinData: [],
    foodItems: [],
    basalProfileData: [],
  };

  const safeStartMs =
    typeof startMs === 'number' && Number.isFinite(startMs) ? startMs : NaN;
  const safeEndMs =
    typeof endMs === 'number' && Number.isFinite(endMs) ? endMs : NaN;
  if (
    !Number.isFinite(safeStartMs) ||
    !Number.isFinite(safeEndMs) ||
    safeEndMs <= safeStartMs
  ) {
    return result;
  }
  const loadBgSamples = async (): Promise<BgSample[]> => {
    let bgSamples: BgSample[] = existingBgSamples ?? [];
    const shouldFetchBg =
      !bgSamples.length ||
      !isLikelyCompleteBgSetForRange(bgSamples, safeStartMs, safeEndMs);

    if (shouldFetchBg) {
      try {
        bgSamples = await fetchBgDataForDateRangeUncached(
          new Date(safeStartMs),
          new Date(safeEndMs),
          {
            count: estimateCountForRangeMs(safeStartMs, safeEndMs, 288),
          },
        );
      } catch (e) {
        // Fall back to whatever we have (even if sparse) rather than failing hard.
        bgSamples = filterBgSamplesToRange(
          existingBgSamples ?? [],
          safeStartMs,
          safeEndMs,
        );
      }
    } else {
      bgSamples = filterBgSamplesToRange(bgSamples, safeStartMs, safeEndMs);
    }

    return sortBgSamplesAsc(bgSamples);
  };
  const [initialBgSamples, context] = await Promise.all([
    loadBgSamples(),
    includeDeviceStatus || includeTreatments || includeProfile
      ? loadInsulinContext({startMs: safeStartMs, endMs: safeEndMs})
      : null,
  ]);
  let bgSamples = initialBgSamples;
  if (includeDeviceStatus && bgSamples.length && context) {
    bgSamples = mergeLoadSamplesIntoBgSamples({
      bgSamples,
      loadSamples: context.loadSamples,
    });
  }

  // Keep ordering stable after enrichment.
  bgSamples = sortBgSamplesAsc(bgSamples);

  result.bgSamples = bgSamples;

  if (includeTreatments && context) {
    result.insulinData = context.insulinData;
    result.foodItems = context.carbTreatments;
  }

  if (includeProfile && context) {
    result.basalProfileData = context.basalProfileData;
  }
  if (context) {
    result.availability = context.availability;
  }

  return result;
}

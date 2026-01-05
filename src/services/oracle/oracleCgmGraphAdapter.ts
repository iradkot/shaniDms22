import {BgSample} from 'app/types/day_bgs.types';
import {TrendDirectionString} from 'app/types/notifications';
import {InsulinDataEntry} from 'app/types/insulin.types';
import {FoodItemDTO} from 'app/types/food.types';

import {
  OracleCachedTreatment,
  OracleMatchTrace,
  OracleSeriesPoint,
} from './oracleTypes';
import {ORACLE_MINUTE_MS} from './oracleConstants';

const ORACLE_BG_SAMPLE_DIRECTION: TrendDirectionString = 'NOT COMPUTABLE';

function toBgSample(params: {ts: number; sgv: number}): BgSample {
  const date = params.ts;
  return {
    sgv: Math.round(params.sgv),
    date,
    dateString: new Date(date).toISOString(),
    trend: 0,
    direction: ORACLE_BG_SAMPLE_DIRECTION,
    device: 'oracle',
    type: 'sgv',
  };
}

function stableTreatmentId(prefix: string, t: OracleCachedTreatment): string {
  const insulin = typeof t.insulin === 'number' ? t.insulin : 0;
  const carbs = typeof t.carbs === 'number' ? t.carbs : 0;
  const kind = insulin > 0 ? 'insulin' : carbs > 0 ? 'carbs' : 'other';
  return `${prefix}-${kind}-${t.ts}-${insulin}-${carbs}`;
}

export function oracleSeriesToBgSamples(params: {
  /** Timestamp (ms) of t=0 for this series. */
  anchorTs: number;
  points: OracleSeriesPoint[];
}): BgSample[] {
  const {anchorTs, points} = params;
  if (!points?.length) return [];

  // `points` are already in ascending `tMin` in our matching pipeline.
  // Avoid extra sort work here.
  const samples: BgSample[] = [];
  for (const p of points) {
    const ts = anchorTs + p.tMin * ORACLE_MINUTE_MS;
    if (!Number.isFinite(ts) || !Number.isFinite(p.sgv)) continue;
    samples.push(toBgSample({ts, sgv: p.sgv}));
  }
  return samples;
}

export function oracleTreatmentsToCgmInputs(params: {
  treatments: OracleCachedTreatment[] | undefined;
  /** Used to generate stable IDs (e.g. match anchor timestamp). */
  idPrefix: string;
}): {foodItems: FoodItemDTO[]; insulinData: InsulinDataEntry[]} {
  const {treatments, idPrefix} = params;
  if (!treatments?.length) return {foodItems: [], insulinData: []};

  const foodItems: FoodItemDTO[] = [];
  const insulinData: InsulinDataEntry[] = [];

  for (const t of treatments) {
    if (!t || !Number.isFinite(t.ts)) continue;

    if (typeof t.carbs === 'number' && Number.isFinite(t.carbs) && t.carbs > 0) {
      foodItems.push({
        id: stableTreatmentId(idPrefix, t),
        carbs: t.carbs,
        name: 'Carbs',
        image: '',
        notes: '',
        score: 0,
        timestamp: t.ts,
      });
    }

    if (typeof t.insulin === 'number' && Number.isFinite(t.insulin) && t.insulin > 0) {
      insulinData.push({
        type: 'bolus',
        amount: t.insulin,
        timestamp: new Date(t.ts).toISOString(),
      });
    }
  }

  // `treatments` come from a sorted slice in the matching layer.
  // Keep ordering stable without sorting/parsing timestamps again.
  return {foodItems, insulinData};
}

export type OracleMatchDetailsPayload = {
  matchAnchorTs: number;
  bgSamples: BgSample[];
  foodItems: FoodItemDTO[];
  insulinData: InsulinDataEntry[];
  windowStartMs: number;
  windowEndMs: number;
};

/**
 * Produces ready-to-render inputs for `CgmGraph` for a historical match.
 *
 * This is intentionally an adapter, so Oracle matching logic can evolve
 * independently from the CGM graph implementation.
 */
export function oracleMatchToCgmGraphData(match: OracleMatchTrace): {
  bgSamples: BgSample[];
  foodItems: FoodItemDTO[];
  insulinData: InsulinDataEntry[];
  windowStartMs: number;
  windowEndMs: number;
} {
  const bgSamples = oracleSeriesToBgSamples({anchorTs: match.anchorTs, points: match.points});

  const {foodItems, insulinData} = oracleTreatmentsToCgmInputs({
    treatments: match.treatments30m,
    idPrefix: String(match.anchorTs),
  });

  const windowStartMs = match.anchorTs - 120 * ORACLE_MINUTE_MS;
  const windowEndMs = match.anchorTs + 240 * ORACLE_MINUTE_MS;

  return {
    bgSamples,
    foodItems,
    insulinData,
    windowStartMs,
    windowEndMs,
  };
}

/**
 * Typed payload helper for a future "match details" drill-down screen.
 *
 * Keeping this in the adapter layer prevents Oracle UI + matching code from
 * depending directly on the CGM graph details.
 */
export function buildOracleMatchDetailsPayload(match: OracleMatchTrace): OracleMatchDetailsPayload {
  return {
    matchAnchorTs: match.anchorTs,
    ...oracleMatchToCgmGraphData(match),
  };
}

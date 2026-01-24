import {
  fetchBgDataForDateRangeUncached,
  fetchTreatmentsForDateRangeUncached,
} from 'app/api/apiRequests';
import {enrichBgSamplesWithDeviceStatusForRange} from 'app/utils/stackedChartsData.utils';
import {
  mapNightscoutTreatmentsToCarbFoodItems,
  mapNightscoutTreatmentsToInsulinDataEntries,
} from 'app/utils/nightscoutTreatments.utils';

import {buildHypoDetectiveContext} from './hypoDetectiveContextBuilder';

type ToolResult = {ok: true; result: any} | {ok: false; error: string};

export type AiAnalystToolName =
  | 'getCgmSamples'
  | 'getTreatments'
  | 'getInsulinSummary'
  | 'getHypoDetectiveContext';

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback;
  return Math.max(min, Math.min(max, n));
}

function downsampleEvenly<T>(arr: T[], max: number): T[] {
  if (!Array.isArray(arr)) return [];
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  const out: T[] = [];
  for (let i = 0; i < arr.length; i += step) out.push(arr[i]);
  return out;
}

export async function runAiAnalystTool(name: AiAnalystToolName, args: any): Promise<ToolResult> {
  try {
    switch (name) {
      case 'getCgmSamples': {
        const rangeDays = clampInt(args?.rangeDays, 1, 180, 14);
        const maxSamples = clampInt(args?.maxSamples, 50, 2000, 500);
        const includeDeviceStatus = Boolean(args?.includeDeviceStatus);

        const endMs = Date.now();
        const startMs = endMs - rangeDays * 24 * 60 * 60 * 1000;

        const bg = await fetchBgDataForDateRangeUncached(new Date(startMs), new Date(endMs));
        const enriched = includeDeviceStatus
          ? await enrichBgSamplesWithDeviceStatusForRange({startMs, endMs, bgSamples: bg})
          : bg;

        const values = (enriched ?? []).map(s => s?.sgv).filter(v => typeof v === 'number');
        const min = values.length ? Math.min(...values) : null;
        const max = values.length ? Math.max(...values) : null;
        const avg = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;

        const samples = downsampleEvenly(enriched ?? [], maxSamples).map(s => ({
          tMs: s.date,
          mgdl: s.sgv,
          iobU: typeof (s as any)?.iob === 'number' ? (s as any).iob : null,
          cobG: typeof (s as any)?.cob === 'number' ? (s as any).cob : null,
        }));

        return {
          ok: true,
          result: {
            range: {startMs, endMs, rangeDays},
            count: enriched?.length ?? 0,
            stats: {minMgdl: min, maxMgdl: max, avgMgdl: avg},
            samples,
          },
        };
      }

      case 'getTreatments': {
        const rangeDays = clampInt(args?.rangeDays, 1, 180, 14);
        const endMs = Date.now();
        const startMs = endMs - rangeDays * 24 * 60 * 60 * 1000;

        const treatments = await fetchTreatmentsForDateRangeUncached(new Date(startMs), new Date(endMs));

        return {
          ok: true,
          result: {
            range: {startMs, endMs, rangeDays},
            count: treatments?.length ?? 0,
            // Keep raw payload small; include the newest 200 entries only.
            recent: (treatments ?? []).slice(0, 200),
          },
        };
      }

      case 'getInsulinSummary': {
        const rangeDays = clampInt(args?.rangeDays, 1, 90, 7);
        const endMs = Date.now();
        const startMs = endMs - rangeDays * 24 * 60 * 60 * 1000;

        const treatments = await fetchTreatmentsForDateRangeUncached(new Date(startMs), new Date(endMs));
        const insulinEntries = mapNightscoutTreatmentsToInsulinDataEntries(treatments);
        const carbItems = mapNightscoutTreatmentsToCarbFoodItems(treatments);

        const bolusTotal = insulinEntries
          .filter(e => e.type === 'bolus')
          .reduce((sum: number, e: any) => sum + (typeof e.amount === 'number' ? e.amount : 0), 0);

        const carbsTotal = carbItems.reduce((sum, c) => sum + (typeof c.carbs === 'number' ? c.carbs : 0), 0);

        return {
          ok: true,
          result: {
            range: {startMs, endMs, rangeDays},
            totals: {
              bolusU: Number(bolusTotal.toFixed(2)),
              carbsG: Math.round(carbsTotal),
            },
            counts: {
              insulinEntries: insulinEntries.length,
              carbTreatments: carbItems.length,
            },
            recent: {
              insulinEntries: insulinEntries.slice(0, 100),
              carbTreatments: carbItems.slice(0, 100),
            },
          },
        };
      }

      case 'getHypoDetectiveContext': {
        const rangeDays = clampInt(args?.rangeDays, 1, 180, 60);
        const lowThresholdMgdl = clampInt(args?.lowThresholdMgdl, 40, 120, 54);
        const maxEvents = clampInt(args?.maxEvents, 1, 30, 12);

        const {contextJson, debug} = await buildHypoDetectiveContext({
          rangeDays,
          lowThreshold: lowThresholdMgdl,
          maxEvents,
        });

        return {ok: true, result: {contextJson, debug}};
      }

      default:
        return {ok: false, error: `Unknown tool: ${name}`};
    }
  } catch (e: any) {
    return {ok: false, error: e?.message ? String(e.message) : 'Tool failed'};
  }
}

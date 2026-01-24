import {
  fetchBgDataForDateRangeUncached,
  fetchTreatmentsForDateRangeUncached,
  getUserProfileFromNightscout,
} from 'app/api/apiRequests';
import {enrichBgSamplesWithDeviceStatusForRange} from 'app/utils/stackedChartsData.utils';
import {
  extractBasalProfileFromNightscoutProfileData,
  mapNightscoutTreatmentsToCarbFoodItems,
  mapNightscoutTreatmentsToInsulinDataEntries,
} from 'app/utils/nightscoutTreatments.utils';

import {extractHypoEvents} from 'app/containers/MainTabsNavigator/Containers/Trends/utils/hypoInvestigation.utils';
import {BgSample} from 'app/types/day_bgs.types';

import {buildHypoDetectiveContext} from './hypoDetectiveContextBuilder';

type ToolResult = {ok: true; result: any} | {ok: false; error: string};

export type AiAnalystToolName =
  | 'getCgmSamples'
  | 'getCgmData'
  | 'getTreatments'
  | 'getInsulinSummary'
  | 'getHypoDetectiveContext'
  | 'getGlycemicEvents'
  | 'getPumpProfile';

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

function extractHyperEvents(params: {
  bgData: BgSample[];
  highThreshold: number;
  maxGapMinutes?: number;
}): Array<{startMs: number; endMs: number; peakMs: number; peakMgdl: number}> {
  const {bgData, highThreshold} = params;
  const MAX_GAP_MS = Math.max(5, clampInt(params.maxGapMinutes, 5, 60, 20)) * 60_000;

  const chron = [...(bgData ?? [])].sort((a, b) => a.date - b.date);
  const out: Array<{startMs: number; endMs: number; peakMs: number; peakMgdl: number}> = [];

  let inEvent = false;
  let startMs: number | null = null;
  let endMs: number | null = null;
  let peak: BgSample | null = null;
  let lastTs: number | null = null;

  const close = () => {
    if (!inEvent || startMs == null || endMs == null || peak == null) {
      inEvent = false;
      startMs = null;
      endMs = null;
      peak = null;
      return;
    }
    out.push({startMs, endMs, peakMs: peak.date, peakMgdl: peak.sgv});
    inEvent = false;
    startMs = null;
    endMs = null;
    peak = null;
  };

  for (const s of chron) {
    const ts = s?.date;
    const v = s?.sgv;
    if (typeof ts !== 'number' || typeof v !== 'number') continue;

    const gapBreaks = lastTs != null && ts - lastTs > MAX_GAP_MS;
    if (gapBreaks) close();

    const isHigh = v > highThreshold;
    if (isHigh && !inEvent) {
      inEvent = true;
      startMs = ts;
      endMs = ts;
      peak = s;
    } else if (isHigh && inEvent) {
      endMs = ts;
      if (peak == null || v > peak.sgv) peak = s;
    } else if (!isHigh && inEvent) {
      close();
    }

    lastTs = ts;
  }

  close();
  return out;
}

export async function runAiAnalystTool(name: AiAnalystToolName, args: any): Promise<ToolResult> {
  try {
    switch (name) {
      case 'getCgmData':
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

      case 'getGlycemicEvents': {
        const kind = args?.kind === 'hyper' ? 'hyper' : 'hypo';
        const rangeDays = clampInt(args?.rangeDays, 1, 180, 30);
        const thresholdMgdl = clampInt(args?.thresholdMgdl, 40, 600, kind === 'hyper' ? 250 : 70);
        const maxEvents = clampInt(args?.maxEvents, 1, 200, 60);

        const endMs = Date.now();
        const startMs = endMs - rangeDays * 24 * 60 * 60 * 1000;

        const bg = await fetchBgDataForDateRangeUncached(new Date(startMs), new Date(endMs));

        if (kind === 'hypo') {
          const events = extractHypoEvents({bgData: bg, lowThreshold: thresholdMgdl})
            .slice(0, maxEvents)
            .map(e => ({
              startMs: e.startMs,
              endMs: e.endMs,
              nadirMs: e.nadirMs,
              nadirMgdl: e.nadirSgv,
              minutesLow: Math.max(0, Math.round((e.endMs - e.startMs) / 60_000)),
              driver: e.driver,
            }));

          return {
            ok: true,
            result: {
              kind,
              range: {startMs, endMs, rangeDays},
              thresholdMgdl,
              count: events.length,
              events,
            },
          };
        }

        const events = extractHyperEvents({
          bgData: bg,
          highThreshold: thresholdMgdl,
          maxGapMinutes: args?.maxGapMinutes,
        })
          .slice(0, maxEvents)
          .map(e => ({
            startMs: e.startMs,
            endMs: e.endMs,
            peakMs: e.peakMs,
            peakMgdl: e.peakMgdl,
            minutesHigh: Math.max(0, Math.round((e.endMs - e.startMs) / 60_000)),
          }));

        return {
          ok: true,
          result: {
            kind,
            range: {startMs, endMs, rangeDays},
            thresholdMgdl,
            count: events.length,
            events,
          },
        };
      }

      case 'getPumpProfile': {
        const dateIso = typeof args?.dateIso === 'string' ? args.dateIso : new Date().toISOString();
        const profileData = await getUserProfileFromNightscout(dateIso);
        const basalProfile = extractBasalProfileFromNightscoutProfileData(profileData as any);

        // Keep payload small: include only the first returned profile and extracted basal.
        const first = Array.isArray(profileData) ? profileData?.[0] : (profileData as any)?.[0];

        return {
          ok: true,
          result: {
            dateIso,
            defaultProfile: first?.defaultProfile ?? null,
            extractedBasalProfile: basalProfile,
            // Provide a shallow snapshot for debugging (avoid large nested stores)
            profileSummary: {
              startDate: first?.startDate ?? null,
              mills: first?.mills ?? null,
              timezone: first?.timezone ?? null,
              units: first?.units ?? null,
            },
          },
        };
      }

      default:
        return {ok: false, error: `Unknown tool: ${name}`};
    }
  } catch (e: any) {
    return {ok: false, error: e?.message ? String(e.message) : 'Tool failed'};
  }
}

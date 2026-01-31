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

// Loop Analysis imports
import {
  fetchProfileChangeHistory,
  findNearestProfileChange,
} from 'app/services/loopAnalysis/profileHistoryService';
import {analyzeSettingsImpact} from 'app/services/loopAnalysis/impactAnalysisService';
import {generateImpactSummary} from 'app/services/loopAnalysis/impactAnalysis.utils';

type ToolResult = {ok: true; result: any} | {ok: false; error: string};

export type AiAnalystToolName =
  | 'getCgmSamples'
  | 'getCgmData'
  | 'getTreatments'
  | 'getInsulinSummary'
  | 'getHypoDetectiveContext'
  | 'getGlycemicEvents'
  | 'getPumpProfile'
  | 'getProfileChangeHistory'
  | 'analyzeSettingsImpact';

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

      // =======================================================================
      // LOOP SETTINGS IMPACT ANALYSIS TOOLS
      // =======================================================================

      case 'getProfileChangeHistory': {
        const rangeDays = clampInt(args?.rangeDays, 7, 180, 90);
        const maxEvents = clampInt(args?.maxEvents, 1, 50, 20);
        const excludeTemporary = Boolean(args?.excludeTemporary);

        const endMs = Date.now();
        const startMs = endMs - rangeDays * 24 * 60 * 60 * 1000;

        const events = await fetchProfileChangeHistory({
          startMs,
          endMs,
          limit: maxEvents,
          excludeTemporary,
        });

        return {
          ok: true,
          result: {
            range: {startMs, endMs, rangeDays},
            count: events.length,
            events: events.map(e => ({
              id: e.id,
              date: new Date(e.timestamp).toISOString(),
              source: e.source,
              profileName: e.profileName ?? null,
              summary: e.summary,
              isTemporary: (e.durationMinutes ?? 0) > 0,
            })),
          },
        };
      }

      case 'analyzeSettingsImpact': {
        const changeDate = args?.changeDate;
        const windowDays = clampInt(args?.windowDays, 1, 30, 7);

        if (!changeDate) {
          return {ok: false, error: 'changeDate is required (ISO date string)'};
        }

        const targetTimestamp = Date.parse(changeDate);
        if (!Number.isFinite(targetTimestamp)) {
          return {ok: false, error: 'Invalid changeDate format. Use ISO date string.'};
        }

        // Find the nearest profile change event
        const changeEvent = await findNearestProfileChange(targetTimestamp, 24 * 60 * 60 * 1000);

        if (!changeEvent) {
          return {
            ok: false,
            error: `No profile change found within 24 hours of ${changeDate}. ` +
              `Use getProfileChangeHistory to see available changes.`,
          };
        }

        // Check if post-change period has enough data
        const now = Date.now();
        const postEndMs = changeEvent.timestamp + windowDays * 24 * 60 * 60 * 1000;
        const availablePostMs = Math.max(0, now - changeEvent.timestamp);
        const postCoverage = availablePostMs / (windowDays * 24 * 60 * 60 * 1000);

        if (postCoverage < 0.3) {
          return {
            ok: false,
            error: `Only ${Math.round(postCoverage * 100)}% of the post-change period is available. ` +
              `Try a shorter windowDays or wait longer for more data.`,
          };
        }

        // Run the analysis
        const result = await analyzeSettingsImpact({
          changeEvent,
          windowDays,
        });

        // Generate natural language summary
        const summary = generateImpactSummary(
          result.deltas,
          result.preChange,
          result.postChange,
          result.windowDays
        );

        // Return LLM-friendly output
        return {
          ok: true,
          result: {
            changeDate: new Date(result.changeEvent.timestamp).toISOString(),
            profileName: result.changeEvent.profileName ?? null,
            source: result.changeEvent.source,
            windowDays: result.windowDays,

            preChange: {
              avgBg: result.preChange.averageBg,
              tirPercent: Math.round(result.preChange.timeInRange.target * 10) / 10,
              hypoCount: result.preChange.hypoEventCount,
              hyperCount: result.preChange.hyperEventCount,
              cv: result.preChange.cv,
              gmi: result.preChange.gmi,
            },

            postChange: {
              avgBg: result.postChange.averageBg,
              tirPercent: Math.round(result.postChange.timeInRange.target * 10) / 10,
              hypoCount: result.postChange.hypoEventCount,
              hyperCount: result.postChange.hyperEventCount,
              cv: result.postChange.cv,
              gmi: result.postChange.gmi,
            },

            deltas: {
              tirDelta: result.deltas.tirDelta,
              avgBgDelta: result.deltas.avgBgDelta,
              hypoCountDelta: result.deltas.hypoCountDelta,
              hyperCountDelta: result.deltas.hyperCountDelta,
              isSignificant: result.deltas.isSignificant,
              overallTrend: result.deltas.overallTrend,
            },

            dataQuality: {
              hasEnoughData: result.dataQuality.hasEnoughData,
              preCoverage: Math.round(result.dataQuality.prePeriodCoverage * 100),
              postCoverage: Math.round(result.dataQuality.postPeriodCoverage * 100),
              warnings: result.dataQuality.warnings,
            },

            summary,
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

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
import {detectSettingsChanges} from 'app/services/loopAnalysis/settingsChangeDetection';
import {analyzeSettingsImpact} from 'app/services/loopAnalysis/impactAnalysisService';
import {generateImpactSummary} from 'app/services/loopAnalysis/impactAnalysis.utils';
import {calculatePeriodStats} from 'app/services/loopAnalysis/impactAnalysis.utils';
import {TimeValueEntry} from 'app/types/insulin.types';
import {cgmRange, CGM_STATUS_CODES} from 'app/constants/PLAN_CONFIG';
import {DEFAULT_NIGHT_WINDOW} from 'app/constants/GLUCOSE_WINDOWS';
import type {TirThresholds} from 'app/types/loopAnalysis.types';

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
  | 'analyzeSettingsImpact'
  // Loop Settings Advisor tools (camelCase)
  | 'getGlucosePatterns'
  | 'analyzeTimeInRange'
  | 'comparePeriods'
  | 'getInsulinDeliveryStats'
  | 'analyzeMealResponses'
  // New helper tools for better recommendations + export
  | 'getSettingsChangeHistory'
  | 'getCurrentProfileSettings'
  | 'getGlucoseStats'
  | 'getMonthlyGlucoseSummary'
  // Snake_case aliases (LLM often uses these)
  | 'get_glucose_patterns'
  | 'analyze_time_in_range'
  | 'compare_periods'
  | 'get_insulin_delivery_stats'
  | 'analyze_meal_responses'
  | 'get_settings_change_history'
  | 'get_profile_change_history'
  | 'get_current_profile_settings'
  | 'get_glucose_stats'
  | 'get_monthly_glucose_summary';

// Normalize tool names: convert snake_case to camelCase
function normalizeToolName(name: string): string {
  const snakeToCamelMap: Record<string, string> = {
    'get_glucose_patterns': 'getGlucosePatterns',
    'analyze_time_in_range': 'analyzeTimeInRange',
    'compare_periods': 'comparePeriods',
    'get_insulin_delivery_stats': 'getInsulinDeliveryStats',
    'analyze_meal_responses': 'analyzeMealResponses',
    'get_settings_change_history': 'getSettingsChangeHistory',
    'get_profile_change_history': 'getProfileChangeHistory',
    'get_current_profile_settings': 'getCurrentProfileSettings',
    'get_glucose_stats': 'getGlucoseStats',
    'get_monthly_glucose_summary': 'getMonthlyGlucoseSummary',
    'get_cgm_samples': 'getCgmSamples',
    'get_cgm_data': 'getCgmData',
    'get_treatments': 'getTreatments',
    'get_pump_profile': 'getPumpProfile',
  };
  return snakeToCamelMap[name] || name;
}

function timeStrToMinutes(timeStr: string): number | null {
  if (typeof timeStr !== 'string') return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeStr.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

function valueAtMinutes(schedule: TimeValueEntry[] | undefined, minutes: number): number | null {
  const entries = Array.isArray(schedule) ? schedule : [];
  const parsed = entries
    .map(e => ({m: timeStrToMinutes(String((e as any)?.time)), v: (e as any)?.value}))
    .filter(x => typeof x.m === 'number' && typeof x.v === 'number') as Array<{m: number; v: number}>;

  if (parsed.length === 0) return null;
  const sorted = parsed.sort((a, b) => a.m - b.m);

  // Find the last entry whose time <= minutes; if none, wrap to last entry.
  let current = sorted[sorted.length - 1];
  for (const e of sorted) {
    if (e.m <= minutes) current = e;
    else break;
  }
  return current?.v ?? null;
}

function filterBgByTimeOfDay(samples: BgSample[], timeOfDay: string): BgSample[] {
  const segment = ['all', 'overnight', 'morning', 'afternoon', 'evening'].includes(timeOfDay)
    ? timeOfDay
    : 'all';
  if (segment === 'all') return samples;

  const nightStartHour = Math.max(0, Math.min(23, Math.trunc(DEFAULT_NIGHT_WINDOW.startHour ?? 0)));
  const nightEndHour = Math.max(0, Math.min(23, Math.trunc(DEFAULT_NIGHT_WINDOW.endHour ?? 6)));
  const inOvernight = (hour: number) => {
    if (nightStartHour === nightEndHour) return true;
    if (nightStartHour < nightEndHour) return hour >= nightStartHour && hour < nightEndHour;
    // Wraps midnight
    return hour >= nightStartHour || hour < nightEndHour;
  };

  return (samples ?? []).filter(s => {
    const hour = new Date(s.date).getHours();
    switch (segment) {
      case 'overnight':
        return inOvernight(hour);
      case 'morning':
        return hour >= 6 && hour < 12;
      case 'afternoon':
        return hour >= 12 && hour < 18;
      case 'evening':
        return hour >= 18 && hour < 24;
      default:
        return true;
    }
  });
}

function getTimeOfDayDefinition(timeOfDay: string) {
  const segment = ['all', 'overnight', 'morning', 'afternoon', 'evening'].includes(timeOfDay)
    ? timeOfDay
    : 'all';

  if (segment !== 'overnight') {
    return {
      segment,
      note:
        segment === 'all'
          ? 'all times'
          : segment === 'morning'
            ? 'morning: 06:00–12:00 local'
            : segment === 'afternoon'
              ? 'afternoon: 12:00–18:00 local'
              : 'evening: 18:00–24:00 local',
    };
  }

  const startHour = Math.max(0, Math.min(23, Math.trunc(DEFAULT_NIGHT_WINDOW.startHour ?? 0)));
  const endHour = Math.max(0, Math.min(23, Math.trunc(DEFAULT_NIGHT_WINDOW.endHour ?? 6)));
  const wrapsMidnight = startHour > endHour;

  const pad = (h: number) => String(h).padStart(2, '0');
  const note = `overnight: ${pad(startHour)}:00–${pad(endHour)}:00 local${wrapsMidnight ? ' (wraps midnight)' : ''}`;
  return {segment, startHour, endHour, wrapsMidnight, note};
}

function getTirThresholdsFromGlucoseSettings(): TirThresholds {
  const severeHypo = Number(cgmRange?.[CGM_STATUS_CODES.EXTREME_LOW]);
  const hypo = Number(cgmRange?.TARGET?.min);
  const hyper = Number(cgmRange?.[CGM_STATUS_CODES.VERY_HIGH]);
  const severeHyper = Number(cgmRange?.[CGM_STATUS_CODES.EXTREME_HIGH]);

  const fallback = {veryLowMax: 54, targetMin: 70, targetMax: 180, highMax: 250};
  if (![severeHypo, hypo, hyper, severeHyper].every(n => Number.isFinite(n))) return fallback;

  // Keep basic ordering; if invalid, fall back.
  if (!(severeHypo < hypo && hypo < hyper && hyper < severeHyper)) return fallback;

  return {
    veryLowMax: severeHypo,
    targetMin: hypo,
    targetMax: hyper,
    highMax: severeHyper,
  };
}

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
  // Normalize tool name (convert snake_case to camelCase)
  const normalizedName = normalizeToolName(name) as AiAnalystToolName;
  console.log(`[AiAnalystTool] Calling tool: ${name}${name !== normalizedName ? ` (normalized to ${normalizedName})` : ''}`, args);
  const startTime = Date.now();
  try {
    switch (normalizedName) {
      case 'getCgmData':
      case 'getCgmSamples': {
        const rangeDays = clampInt(args?.rangeDays, 1, 180, 14);
        const maxSamples = clampInt(args?.maxSamples, 50, 2000, 500);
        const includeDeviceStatus = Boolean(args?.includeDeviceStatus);

        const endMs = Date.now();
        const startMs = endMs - rangeDays * 24 * 60 * 60 * 1000;

        const bg = await fetchBgDataForDateRangeUncached(new Date(startMs), new Date(endMs), {throwOnError: true});
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

        const bg = await fetchBgDataForDateRangeUncached(new Date(startMs), new Date(endMs), {throwOnError: true});

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
      // LOOP SETTINGS ADVISOR SUPPORT TOOLS (better current values + trends)
      // =======================================================================

      case 'getSettingsChangeHistory': {
        const daysBack = clampInt(args?.daysBack, 1, 180, 90);
        const changeType = typeof args?.changeType === 'string' ? args.changeType : 'all';

        const endMs = Date.now();
        const startMs = endMs - daysBack * 24 * 60 * 60 * 1000;

        // Pull a reasonable number of the latest changes and then filter by time.
        const rawEvents = await detectSettingsChanges({minEvents: 120, sourceFilter: 'all'});
        const inWindow = rawEvents.filter(e => typeof e.timestamp === 'number' && e.timestamp >= startMs && e.timestamp <= endMs);

        const matchesType = (e: any) => {
          if (changeType === 'all') return true;
          const types = Array.isArray(e?.changeTypes) ? e.changeTypes : [];
          switch (changeType) {
            case 'carb_ratio':
              return types.includes('carb_ratio');
            case 'isf':
              return types.includes('isf');
            case 'dia':
              return types.includes('dia');
            case 'basal':
              return types.includes('basal');
            case 'targets':
              return types.includes('target_low') || types.includes('target_high');
            default:
              return true;
          }
        };

        const filtered = inWindow.filter(matchesType);

        return {
          ok: true,
          result: {
            range: {startMs, endMs, daysBack},
            changeType,
            count: filtered.length,
            events: filtered.map(e => ({
              id: e.id,
              date: new Date(e.timestamp).toISOString(),
              profileName: e.profileName ?? null,
              enteredBy: e.enteredBy ?? null,
              source: e.source ?? null,
              changeTypes: e.changeTypes ?? [],
              summary: e.summary,
              changes: (e.changes ?? []).map((c: any) => ({
                type: c.type,
                label: c.label,
                timeSlot: c.timeSlot,
                oldValue: c.oldValue,
                newValue: c.newValue,
                unit: c.unit,
              })),
            })),
          },
        };
      }

      case 'getCurrentProfileSettings': {
        const dateIso = typeof args?.dateIso === 'string' ? args.dateIso : new Date().toISOString();
        const profileData = await getUserProfileFromNightscout(dateIso);
        const first = Array.isArray(profileData) ? profileData?.[0] : (profileData as any)?.[0];

        const defaultProfileName = first?.defaultProfile ?? null;
        const store = first?.store ?? null;
        const profile = defaultProfileName && store ? store[defaultProfileName] : null;

        const targetLow = profile?.target_low as TimeValueEntry[] | undefined;
        const targetHigh = profile?.target_high as TimeValueEntry[] | undefined;
        const isf = profile?.sens as TimeValueEntry[] | undefined;
        const carbRatio = profile?.carbratio as TimeValueEntry[] | undefined;
        const diaHours = typeof profile?.dia === 'number' ? profile.dia : null;

        const snapshotTimes = [
          {label: '22:00', minutes: 22 * 60},
          {label: '00:00', minutes: 0},
          {label: '03:00', minutes: 3 * 60},
          {label: '06:00', minutes: 6 * 60},
          {label: '12:00', minutes: 12 * 60},
          {label: '18:00', minutes: 18 * 60},
        ];

        const snapshotByTime = snapshotTimes.map(t => ({
          label: t.label,
          targetLow: valueAtMinutes(targetLow, t.minutes),
          targetHigh: valueAtMinutes(targetHigh, t.minutes),
          isf: valueAtMinutes(isf, t.minutes),
          carbRatio: valueAtMinutes(carbRatio, t.minutes),
        }));

        return {
          ok: true,
          result: {
            dateIso,
            units: first?.units ?? null,
            timezone: profile?.timezone ?? first?.timezone ?? null,
            defaultProfile: defaultProfileName,
            diaHours,
            schedules: {
              targetLow: Array.isArray(targetLow) ? targetLow : [],
              targetHigh: Array.isArray(targetHigh) ? targetHigh : [],
              isf: Array.isArray(isf) ? isf : [],
              carbRatio: Array.isArray(carbRatio) ? carbRatio : [],
            },
            snapshotByTime,
          },
        };
      }

      case 'getGlucoseStats': {
        const startDateStr = args?.startDate;
        const endDateStr = args?.endDate;
        const timeOfDay = typeof args?.timeOfDay === 'string' ? args.timeOfDay : 'all';

        if (!startDateStr || !endDateStr) {
          return {ok: false, error: 'startDate and endDate are required (ISO date strings)'};
        }

        const startMs = Date.parse(startDateStr);
        const endMs = Date.parse(endDateStr);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
          return {ok: false, error: 'Invalid date format. Use ISO date strings.'};
        }

        const bg = await fetchBgDataForDateRangeUncached(new Date(startMs), new Date(endMs), {throwOnError: true});
        const filtered = filterBgByTimeOfDay(bg, timeOfDay);
        const tirThresholds = getTirThresholdsFromGlucoseSettings();
        const stats = calculatePeriodStats(filtered, startMs, endMs, tirThresholds);
        const timeOfDayDefinition = getTimeOfDayDefinition(timeOfDay);

        return {
          ok: true,
          result: {
            period: {
              start: new Date(startMs).toISOString(),
              end: new Date(endMs).toISOString(),
              days: Math.max(1, Math.round((endMs - startMs) / (24 * 60 * 60 * 1000))),
            },
            timeOfDay: ['all', 'overnight', 'morning', 'afternoon', 'evening'].includes(timeOfDay) ? timeOfDay : 'all',
            timeOfDayDefinition,
            sampleCount: stats.sampleCount,
            tirThresholdsUsed: tirThresholds,
            stats: {
              avgBg: stats.averageBg,
              cv: stats.cv,
              stdDev: stats.stdDev,
              gmi: stats.gmi,
            },
            tir: {
              veryLowPercent: Math.round(stats.timeInRange.veryLow * 10) / 10,
              lowPercent: Math.round(stats.timeInRange.low * 10) / 10,
              inRangePercent: Math.round(stats.timeInRange.target * 10) / 10,
              highPercent: Math.round(stats.timeInRange.high * 10) / 10,
              veryHighPercent: Math.round(stats.timeInRange.veryHigh * 10) / 10,
            },
            events: {
              hypoEventCount: stats.hypoEventCount,
              hyperEventCount: stats.hyperEventCount,
            },
          },
        };
      }

      case 'getMonthlyGlucoseSummary': {
        const monthsBack = clampInt(args?.monthsBack, 1, 24, 12);
        const timeOfDay = typeof args?.timeOfDay === 'string' ? args.timeOfDay : 'all';
        const tirThresholds = getTirThresholdsFromGlucoseSettings();
        const timeOfDayDefinition = getTimeOfDayDefinition(timeOfDay);

        const now = new Date();
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0); // start of next month
        const start = new Date(end.getFullYear(), end.getMonth() - monthsBack, 1, 0, 0, 0, 0);

        const months: Array<any> = [];
        for (let i = 0; i < monthsBack; i++) {
          const mStart = new Date(end.getFullYear(), end.getMonth() - monthsBack + i, 1, 0, 0, 0, 0);
          const mEnd = new Date(end.getFullYear(), end.getMonth() - monthsBack + i + 1, 1, 0, 0, 0, 0);
          const mStartMs = mStart.getTime();
          const mEndMs = mEnd.getTime();
          // Fetch month-by-month to avoid truncation when requesting large multi-month ranges.
          const inMonth = await fetchBgDataForDateRangeUncached(new Date(mStartMs), new Date(mEndMs), {throwOnError: true});
          const filtered = filterBgByTimeOfDay(inMonth, timeOfDay);
          const stats = calculatePeriodStats(filtered, mStartMs, mEndMs, tirThresholds);

          months.push({
            month: `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, '0')}`,
            period: {start: mStart.toISOString(), end: mEnd.toISOString()},
            sampleCount: stats.sampleCount,
            avgBg: stats.averageBg,
            cv: stats.cv,
            tirPercent: Math.round(stats.timeInRange.target * 10) / 10,
            hypoEventCount: stats.hypoEventCount,
            hyperEventCount: stats.hyperEventCount,
          });
        }

        return {
          ok: true,
          result: {
            monthsBack,
            timeOfDay: ['all', 'overnight', 'morning', 'afternoon', 'evening'].includes(timeOfDay) ? timeOfDay : 'all',
            timeOfDayDefinition,
            tirThresholdsUsed: tirThresholds,
            range: {start: start.toISOString(), end: end.toISOString()},
            months,
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

      // =======================================================================
      // LOOP SETTINGS ADVISOR TOOLS
      // =======================================================================

      case 'getGlucosePatterns': {
        const daysBack = clampInt(args?.daysBack, 7, 90, 14);
        const focusTime = ['all', 'overnight', 'post-meal', 'fasting'].includes(args?.focusTime)
          ? args.focusTime
          : 'all';

        const endMs = Date.now();
        const startMs = endMs - daysBack * 24 * 60 * 60 * 1000;

        const bg = await fetchBgDataForDateRangeUncached(new Date(startMs), new Date(endMs), {throwOnError: true});
        const treatments = await fetchTreatmentsForDateRangeUncached(new Date(startMs), new Date(endMs));

        const nightStartHour = Math.max(0, Math.min(23, Math.trunc(DEFAULT_NIGHT_WINDOW.startHour ?? 0)));
        const nightEndHour = Math.max(0, Math.min(23, Math.trunc(DEFAULT_NIGHT_WINDOW.endHour ?? 6)));
        const inOvernight = (hour: number) => {
          if (nightStartHour === nightEndHour) return true;
          if (nightStartHour < nightEndHour) return hour >= nightStartHour && hour < nightEndHour;
          return hour >= nightStartHour || hour < nightEndHour;
        };

        // Filter by time of day if specified
        const filterByTime = (samples: BgSample[]) => {
          if (focusTime === 'all') return samples;
          return samples.filter(s => {
            const hour = new Date(s.date).getHours();
            switch (focusTime) {
              case 'overnight': return inOvernight(hour);
              case 'fasting': return hour >= 6 && hour < 9;
              case 'post-meal': return (hour >= 7 && hour <= 9) || (hour >= 12 && hour <= 14) || (hour >= 18 && hour <= 20);
              default: return true;
            }
          });
        };

        const filtered = filterByTime(bg);
        const values = filtered.map(s => s.sgv).filter((v): v is number => typeof v === 'number');

        if (values.length < 10) {
          return {
            ok: false,
            error: `Insufficient data for ${focusTime} analysis. Only ${values.length} readings found.`,
          };
        }

        // Calculate statistics
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
        const sd = Math.sqrt(variance);
        const cv = (sd / avg) * 100;

        // Find patterns by hour
        const hourlyStats: Record<number, {sum: number; count: number; min: number; max: number}> = {};
        filtered.forEach(s => {
          const hour = new Date(s.date).getHours();
          if (!hourlyStats[hour]) {
            hourlyStats[hour] = {sum: 0, count: 0, min: Infinity, max: -Infinity};
          }
          hourlyStats[hour].sum += s.sgv;
          hourlyStats[hour].count++;
          hourlyStats[hour].min = Math.min(hourlyStats[hour].min, s.sgv);
          hourlyStats[hour].max = Math.max(hourlyStats[hour].max, s.sgv);
        });

        const hourlyAverages = Object.entries(hourlyStats).map(([hour, stats]) => ({
          hour: parseInt(hour),
          avgBg: Math.round(stats.sum / stats.count),
          minBg: stats.min,
          maxBg: stats.max,
          count: stats.count,
        })).sort((a, b) => a.hour - b.hour);

        const tirThresholds = getTirThresholdsFromGlucoseSettings();

        // Identify problem hours (high or low averages)
        const problemHours = hourlyAverages.filter(h =>
          h.avgBg < tirThresholds.targetMin || h.avgBg > tirThresholds.targetMax
        );

        // Count hypos and hypers
        const hypoCount = values.filter(v => v < tirThresholds.targetMin).length;
        const hyperCount = values.filter(v => v > tirThresholds.targetMax).length;
        const inRangeCount = values.filter(v => v >= tirThresholds.targetMin && v <= tirThresholds.targetMax).length;

        return {
          ok: true,
          result: {
            range: {startMs, endMs, daysBack},
            focusTime,
            sampleCount: values.length,
            tirThresholdsUsed: tirThresholds,
            stats: {
              avgBg: Math.round(avg),
              sdBg: Math.round(sd),
              cv: Math.round(cv * 10) / 10,
              minBg: Math.min(...values),
              maxBg: Math.max(...values),
            },
            distribution: {
              hypoPercent: Math.round((hypoCount / values.length) * 1000) / 10,
              inRangePercent: Math.round((inRangeCount / values.length) * 1000) / 10,
              hyperPercent: Math.round((hyperCount / values.length) * 1000) / 10,
            },
            hourlyAverages,
            problemHours: problemHours.length > 0 ? problemHours : null,
            patterns: {
              mostHighsAt: hourlyAverages.reduce((max, h) => h.avgBg > max.avgBg ? h : max, hourlyAverages[0])?.hour ?? null,
              mostLowsAt: hourlyAverages.reduce((min, h) => h.avgBg < min.avgBg ? h : min, hourlyAverages[0])?.hour ?? null,
              mostVariableAt: hourlyAverages.reduce((max, h) => (h.maxBg - h.minBg) > (max.maxBg - max.minBg) ? h : max, hourlyAverages[0])?.hour ?? null,
            },
          },
        };
      }

      case 'analyzeTimeInRange': {
        const startDateStr = args?.startDate;
        const endDateStr = args?.endDate;
        const timeOfDay = ['all', 'overnight', 'morning', 'afternoon', 'evening'].includes(args?.timeOfDay)
          ? args.timeOfDay
          : 'all';

        if (!startDateStr || !endDateStr) {
          return {ok: false, error: 'startDate and endDate are required (ISO date strings)'};
        }

        const startMs = Date.parse(startDateStr);
        const endMs = Date.parse(endDateStr);

        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
          return {ok: false, error: 'Invalid date format. Use ISO date strings.'};
        }

        const bg = await fetchBgDataForDateRangeUncached(new Date(startMs), new Date(endMs), {throwOnError: true});
        const filtered = filterBgByTimeOfDay(bg, timeOfDay);
        const values = filtered.map(s => s.sgv).filter((v): v is number => typeof v === 'number');

        if (values.length < 10) {
          return {
            ok: false,
            error: `Insufficient data. Only ${values.length} readings found for ${timeOfDay}.`,
          };
        }

        const tirThresholds = getTirThresholdsFromGlucoseSettings();
        const stats = calculatePeriodStats(filtered, startMs, endMs, tirThresholds);
        const total = stats.sampleCount;
        const timeOfDayDefinition = getTimeOfDayDefinition(timeOfDay);

        return {
          ok: true,
          result: {
            period: {
              start: new Date(startMs).toISOString(),
              end: new Date(endMs).toISOString(),
              days: Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)),
            },
            timeOfDay,
            timeOfDayDefinition,
            readingCount: total,
            tirThresholdsUsed: tirThresholds,
            tir: {
              veryLowPercent: Math.round(stats.timeInRange.veryLow * 10) / 10,
              lowPercent: Math.round(stats.timeInRange.low * 10) / 10,
              inRangePercent: Math.round(stats.timeInRange.target * 10) / 10,
              highPercent: Math.round(stats.timeInRange.high * 10) / 10,
              veryHighPercent: Math.round(stats.timeInRange.veryHigh * 10) / 10,
            },
            stats: {
              avgBg: stats.averageBg,
              sdBg: stats.stdDev,
              cv: stats.cv,
              gmi: stats.gmi,
            },
          },
        };
      }

      case 'comparePeriods': {
        const p1Start = Date.parse(args?.period1Start);
        const p1End = Date.parse(args?.period1End);
        const p2Start = Date.parse(args?.period2Start);
        const p2End = Date.parse(args?.period2End);

        if (!Number.isFinite(p1Start) || !Number.isFinite(p1End) ||
            !Number.isFinite(p2Start) || !Number.isFinite(p2End)) {
          return {ok: false, error: 'All four dates are required (ISO date strings)'};
        }

        const [bg1, bg2] = await Promise.all([
          fetchBgDataForDateRangeUncached(new Date(p1Start), new Date(p1End), {throwOnError: true}),
          fetchBgDataForDateRangeUncached(new Date(p2Start), new Date(p2End), {throwOnError: true}),
        ]);

        const tirThresholds = getTirThresholdsFromGlucoseSettings();
        const calcStats = (bg: BgSample[], startMs: number, endMs: number) => {
          const stats = calculatePeriodStats(bg, startMs, endMs, tirThresholds);
          if ((stats.sampleCount ?? 0) < 10) return null;
          if (stats.averageBg == null || stats.stdDev == null || stats.cv == null) return null;

          const hypoPct = stats.timeInRange.veryLow + stats.timeInRange.low;
          const hyperPct = stats.timeInRange.high + stats.timeInRange.veryHigh;

          return {
            count: stats.sampleCount,
            avgBg: stats.averageBg,
            sdBg: stats.stdDev,
            cv: stats.cv,
            tirPercent: Math.round(stats.timeInRange.target * 10) / 10,
            hypoPercent: Math.round(hypoPct * 10) / 10,
            hyperPercent: Math.round(hyperPct * 10) / 10,
          };
        };

        const stats1 = calcStats(bg1, p1Start, p1End);
        const stats2 = calcStats(bg2, p2Start, p2End);

        if (!stats1 || !stats2) {
          return {ok: false, error: 'Insufficient data in one or both periods.'};
        }

        return {
          ok: true,
          result: {
            period1: {
              start: new Date(p1Start).toISOString(),
              end: new Date(p1End).toISOString(),
              days: Math.round((p1End - p1Start) / (24 * 60 * 60 * 1000)),
              ...stats1,
            },
            period2: {
              start: new Date(p2Start).toISOString(),
              end: new Date(p2End).toISOString(),
              days: Math.round((p2End - p2Start) / (24 * 60 * 60 * 1000)),
              ...stats2,
            },
            tirThresholdsUsed: tirThresholds,
            delta: {
              avgBgDelta: stats2.avgBg - stats1.avgBg,
              tirDelta: stats2.tirPercent - stats1.tirPercent,
              cvDelta: stats2.cv - stats1.cv,
              hypoDelta: stats2.hypoPercent - stats1.hypoPercent,
              hyperDelta: stats2.hyperPercent - stats1.hyperPercent,
            },
            interpretation: {
              avgBgImproved: stats2.avgBg < stats1.avgBg && stats2.avgBg > 80,
              tirImproved: stats2.tirPercent > stats1.tirPercent,
              cvImproved: stats2.cv < stats1.cv,
              fewerHypos: stats2.hypoPercent < stats1.hypoPercent,
              fewerHypers: stats2.hyperPercent < stats1.hyperPercent,
            },
          },
        };
      }

      case 'getInsulinDeliveryStats': {
        const startDateStr = args?.startDate;
        const endDateStr = args?.endDate;

        if (!startDateStr || !endDateStr) {
          return {ok: false, error: 'startDate and endDate are required (ISO date strings)'};
        }

        const startMs = Date.parse(startDateStr);
        const endMs = Date.parse(endDateStr);

        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
          return {ok: false, error: 'Invalid date format. Use ISO date strings.'};
        }

        const treatments = await fetchTreatmentsForDateRangeUncached(new Date(startMs), new Date(endMs));
        const insulinEntries = mapNightscoutTreatmentsToInsulinDataEntries(treatments);

        // Separate bolus and temp basal
        const boluses = insulinEntries.filter(e => e.type === 'bolus');
        const tempBasals = insulinEntries.filter(e => e.type === 'tempBasal');

        const totalBolus = boluses.reduce((sum, e) => sum + (e.amount ?? 0), 0);
        const totalTempBasal = tempBasals.reduce((sum, e) => sum + (e.amount ?? 0), 0);
        const totalDaily = totalBolus + totalTempBasal;

        const days = Math.max(1, (endMs - startMs) / (24 * 60 * 60 * 1000));
        const avgDailyBolus = totalBolus / days;
        const avgDailyTempBasal = totalTempBasal / days;

        // Hourly bolus distribution
        const hourlyBolus: Record<number, number> = {};
        boluses.forEach(b => {
          if (b.timestamp) {
            const hour = new Date(b.timestamp).getHours();
            hourlyBolus[hour] = (hourlyBolus[hour] ?? 0) + (b.amount ?? 0);
          }
        });

        const peakBolusHour = Object.entries(hourlyBolus)
          .sort((a, b) => b[1] - a[1])[0]?.[0];

        return {
          ok: true,
          result: {
            period: {
              start: new Date(startMs).toISOString(),
              end: new Date(endMs).toISOString(),
              days: Math.round(days),
            },
            totals: {
              bolusU: Math.round(totalBolus * 100) / 100,
              tempBasalU: Math.round(totalTempBasal * 100) / 100,
              totalU: Math.round(totalDaily * 100) / 100,
            },
            dailyAverages: {
              bolusU: Math.round(avgDailyBolus * 100) / 100,
              tempBasalU: Math.round(avgDailyTempBasal * 100) / 100,
              totalU: Math.round((avgDailyBolus + avgDailyTempBasal) * 100) / 100,
            },
            ratio: {
              bolusPercent: totalDaily > 0 ? Math.round((totalBolus / totalDaily) * 1000) / 10 : 0,
              tempBasalPercent: totalDaily > 0 ? Math.round((totalTempBasal / totalDaily) * 1000) / 10 : 0,
            },
            counts: {
              bolusCount: boluses.length,
              avgBolusesPerDay: Math.round((boluses.length / days) * 10) / 10,
            },
            patterns: {
              peakBolusHour: peakBolusHour ? parseInt(peakBolusHour) : null,
              hourlyBolusDistribution: Object.entries(hourlyBolus)
                .map(([h, u]) => ({hour: parseInt(h), totalU: Math.round(u * 100) / 100}))
                .sort((a, b) => a.hour - b.hour),
            },
          },
        };
      }

      case 'analyzeMealResponses': {
        const daysBack = clampInt(args?.daysBack, 7, 90, 14);
        const mealType = ['breakfast', 'lunch', 'dinner', 'snack', 'all'].includes(args?.mealType)
          ? args.mealType
          : 'all';

        const endMs = Date.now();
        const startMs = endMs - daysBack * 24 * 60 * 60 * 1000;

        const [bg, treatments] = await Promise.all([
          fetchBgDataForDateRangeUncached(new Date(startMs), new Date(endMs), {throwOnError: true}),
          fetchTreatmentsForDateRangeUncached(new Date(startMs), new Date(endMs)),
        ]);

        const carbItems = mapNightscoutTreatmentsToCarbFoodItems(treatments);

        // Classify meals by time of day
        const classifyMeal = (timestamp: number): string => {
          const hour = new Date(timestamp).getHours();
          if (hour >= 5 && hour < 10) return 'breakfast';
          if (hour >= 10 && hour < 14) return 'lunch';
          if (hour >= 17 && hour < 21) return 'dinner';
          return 'snack';
        };

        // Filter carb entries by meal type
        const filteredCarbs = mealType === 'all'
          ? carbItems
          : carbItems.filter(c => classifyMeal(c.timestamp) === mealType);

        if (filteredCarbs.length < 3) {
          return {
            ok: false,
            error: `Insufficient meal data. Only ${filteredCarbs.length} ${mealType} entries found.`,
          };
        }

        // Analyze glucose response for each meal
        const mealResponses = filteredCarbs.map(carb => {
          const mealTime = carb.timestamp;

          // Find BG at meal time, 1hr after, 2hr after, 3hr after
          const findNearestBg = (targetMs: number, windowMs: number = 15 * 60 * 1000) => {
            const nearby = bg.filter(s =>
              Math.abs(s.date - targetMs) < windowMs
            ).sort((a, b) =>
              Math.abs(a.date - targetMs) - Math.abs(b.date - targetMs)
            );
            return nearby[0]?.sgv ?? null;
          };

          const bgAtMeal = findNearestBg(mealTime);
          const bg1hr = findNearestBg(mealTime + 60 * 60 * 1000);
          const bg2hr = findNearestBg(mealTime + 2 * 60 * 60 * 1000);
          const bg3hr = findNearestBg(mealTime + 3 * 60 * 60 * 1000);

          // Find peak BG in 3hr window
          const postMealBg = bg.filter(s =>
            s.date >= mealTime && s.date <= mealTime + 3 * 60 * 60 * 1000
          );
          const peakBg = postMealBg.length > 0
            ? Math.max(...postMealBg.map(s => s.sgv))
            : null;

          const rise = bgAtMeal && peakBg ? peakBg - bgAtMeal : null;

          return {
            timestamp: mealTime,
            type: classifyMeal(mealTime),
            carbs: carb.carbs,
            bgAtMeal,
            bg1hr,
            bg2hr,
            bg3hr,
            peakBg,
            rise,
          };
        }).filter(m => m.bgAtMeal !== null);

        // Calculate averages
        const withRise = mealResponses.filter(m => m.rise !== null);
        const avgRise = withRise.length > 0
          ? withRise.reduce((sum, m) => sum + (m.rise ?? 0), 0) / withRise.length
          : null;

        const avgPeak = mealResponses.filter(m => m.peakBg !== null).length > 0
          ? mealResponses.reduce((sum, m) => sum + (m.peakBg ?? 0), 0) / mealResponses.filter(m => m.peakBg !== null).length
          : null;

        const avgCarbs = mealResponses.reduce((sum, m) => sum + (m.carbs ?? 0), 0) / mealResponses.length;

        // Identify problem meals
        const problematicMeals = mealResponses.filter(m =>
          (m.rise && m.rise > 80) || (m.peakBg && m.peakBg > 200)
        );

        return {
          ok: true,
          result: {
            range: {startMs, endMs, daysBack},
            mealType,
            mealCount: mealResponses.length,
            averages: {
              avgRiseMgdl: avgRise !== null ? Math.round(avgRise) : null,
              avgPeakMgdl: avgPeak !== null ? Math.round(avgPeak) : null,
              avgCarbsG: Math.round(avgCarbs),
            },
            problematicMealCount: problematicMeals.length,
            problematicPercent: Math.round((problematicMeals.length / mealResponses.length) * 100),
            recentMeals: mealResponses.slice(0, 10).map(m => ({
              date: new Date(m.timestamp).toISOString(),
              type: m.type,
              carbsG: m.carbs,
              bgAtMeal: m.bgAtMeal,
              peakBg: m.peakBg,
              riseMgdl: m.rise,
              returnedToRange: m.bg3hr !== null && m.bg3hr <= 180,
            })),
            summary: {
              mealsWithHighSpike: mealResponses.filter(m => m.rise && m.rise > 80).length,
              mealsWithGoodControl: mealResponses.filter(m => m.peakBg && m.peakBg <= 180).length,
              avgTimeToReturn: null, // Could be calculated with more complex logic
            },
          },
        };
      }

      default:
        console.warn(`[AiAnalystTool] Unknown tool requested: ${name}`);
        return {ok: false, error: `Unknown tool: ${name}`};
    }
  } catch (e: any) {
    const duration = Date.now() - startTime;
    console.error(`[AiAnalystTool] Tool ${name} FAILED after ${duration}ms:`, e?.message || e);
    return {ok: false, error: e?.message ? String(e.message) : 'Tool failed'};
  }
}

import type {DayGraphModel} from '../../modules/dayGraph';
import type {BgSample} from '../../types/day_bgs.types';
import type {FoodItemDTO} from '../../types/food.types';
import type {BasalProfile, InsulinDataEntry} from '../../types/insulin.types';
import type {TrendDirectionString} from '../../types/notifications';
import {getSampleIobTotal} from '../../utils/chartLoadSeries.utils';

const MINUTE_MS = 60 * 1000;

const TREND_DIRECTIONS = new Set<TrendDirectionString>([
  'FortyFiveDown',
  'FortyFiveUp',
  'SingleDown',
  'SingleUp',
  'DoubleDown',
  'DoubleUp',
  'Flat',
  'NOT COMPUTABLE',
  'RATE OUT OF RANGE',
]);

export interface DayGraphChartAvailability {
  readonly activeInsulin: boolean;
  readonly activeCarbohydrates: boolean;
  readonly boluses: boolean;
  readonly basal: boolean;
}

export interface DayGraphChartPresentation {
  readonly bgSamples: BgSample[];
  readonly foodItems: FoodItemDTO[];
  readonly insulinData: InsulinDataEntry[];
  readonly basalProfileData: BasalProfile;
  readonly xDomain: [Date, Date];
  readonly fallbackAnchorTimeMs: number | undefined;
  readonly availability: DayGraphChartAvailability;
}

const identityKey = (sourceId: string, recordId: string): string =>
  `${sourceId.length}:${sourceId}${recordId.length}:${recordId}`;

const direction = (value: string | undefined): TrendDirectionString =>
  value !== undefined && TREND_DIRECTIONS.has(value as TrendDirectionString)
    ? (value as TrendDirectionString)
    : 'NOT COMPUTABLE';

const toBgSamples = (model: DayGraphModel): BgSample[] =>
  model.glucoseSamples.map(sample => ({
    sgv: sample.valueMgDl,
    date: sample.timestampMs,
    dateString: `${new Date(sample.timestampMs).toISOString()}#${identityKey(
      sample.identity.sourceId,
      sample.identity.recordId,
    )}`,
    trend: 0,
    direction: direction(sample.direction),
    device: sample.device ?? 'Nightscout',
    type: 'sgv',
    ...(sample.iobUnits === undefined ? {} : {iob: sample.iobUnits}),
    ...(sample.bolusIobUnits === undefined
      ? {}
      : {iobBolus: sample.bolusIobUnits}),
    ...(sample.basalIobUnits === undefined
      ? {}
      : {iobBasal: sample.basalIobUnits}),
    ...(sample.cobGrams === undefined ? {} : {cob: sample.cobGrams}),
  }));

const toFoodItems = (model: DayGraphModel): FoodItemDTO[] =>
  model.timelineItems.flatMap(item => {
    if (
      (item.kind !== 'external-carb' && item.kind !== 'journal-meal') ||
      item.carbohydratesGrams === undefined ||
      !Number.isFinite(item.carbohydratesGrams) ||
      item.carbohydratesGrams <= 0
    ) {
      return [];
    }
    return [
      {
        id: identityKey(item.identity.sourceId, item.identity.recordId),
        carbs: item.carbohydratesGrams,
        name: item.title,
        image: '',
        notes: item.detail ?? '',
        score: 0,
        timestamp: item.timestampMs,
      },
    ];
  });

const toInsulinData = (model: DayGraphModel): InsulinDataEntry[] =>
  model.insulinEvents.map(event => {
    if (event.kind === 'bolus') {
      return {
        type: 'bolus',
        amount: event.units,
        timestamp: new Date(event.timestampMs).toISOString(),
      };
    }
    if (event.kind === 'temp-basal') {
      const startTime = new Date(event.startMs).toISOString();
      return {
        type: 'tempBasal',
        rate: event.rateUnitsPerHour,
        duration: (event.endMs - event.startMs) / MINUTE_MS,
        startTime,
        endTime: new Date(event.endMs).toISOString(),
        timestamp: startTime,
      };
    }
    const startTime = new Date(event.startMs).toISOString();
    return {
      type: 'suspendPump',
      suspend: true,
      startTime,
      timestamp: startTime,
      ...(event.endMs === undefined
        ? {}
        : {
            endTime: new Date(event.endMs).toISOString(),
            duration: (event.endMs - event.startMs) / MINUTE_MS,
          }),
    };
  });

const formatScheduleTime = (secondsFromMidnight: number): string => {
  const hours = Math.floor(secondsFromMidnight / 3600);
  const minutes = Math.floor((secondsFromMidnight % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
    2,
    '0',
  )}`;
};

const toBasalProfile = (model: DayGraphModel): BasalProfile =>
  model.basalSchedule.map(entry => ({
    time: formatScheduleTime(entry.secondsFromMidnight),
    timeAsSeconds: entry.secondsFromMidnight,
    value: entry.rateUnitsPerHour,
  }));

/**
 * Typed adapter between the rebuilt Day Graph module and the proven rich chart
 * implementation. Callers only need the factual Day Graph model.
 */
export const buildDayGraphChartPresentation = (
  model: DayGraphModel,
): DayGraphChartPresentation => {
  const bgSamples = toBgSamples(model);
  const foodItems = toFoodItems(model);
  const insulinData = toInsulinData(model);
  const basalProfileData = toBasalProfile(model);
  return {
    bgSamples,
    foodItems,
    insulinData,
    basalProfileData,
    xDomain: [
      new Date(model.period.dayStartMs),
      new Date(model.period.dayEndMs),
    ],
    fallbackAnchorTimeMs: bgSamples[bgSamples.length - 1]?.date,
    availability: {
      activeInsulin: bgSamples.some(
        sample => getSampleIobTotal(sample) != null,
      ),
      activeCarbohydrates: bgSamples.some(sample =>
        Number.isFinite(sample.cob),
      ),
      boluses: insulinData.some(event => event.type === 'bolus'),
      basal:
        basalProfileData.length > 0 ||
        insulinData.some(event => event.type !== 'bolus'),
    },
  };
};

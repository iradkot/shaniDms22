import type {GlucoseForecastSnapshot, ForecastSourceId} from '../src/modules/glucoseForecast';
import {previewModel} from './dayGraphPreviewFixture';

// Synthetic visual QA fixture; never imported by the application runtime.
const last = previewModel.glucoseSamples[previewModel.glucoseSamples.length - 1]!;
export const previewForecast: GlucoseForecastSnapshot = {
  version: 1,
  generatedAtMs: last.timestampMs,
  glucoseTimestampMs: last.timestampMs,
  history: previewModel.glucoseSamples.map(sample => ({ts: sample.timestampMs, sgv: sample.valueMgDl})),
  context: {iobUnits: 0.35, cobGrams: 8, historyDays: 28, matchedExamples: 34,
    features: ['glucose', 'trend', 'time-of-day', 'day-of-week', 'iob', 'cob']},
  series: (['loop', 'nightscout', 'personalized', 'ensemble'] as const).map((id: ForecastSourceId, index) => ({
    id, label: id, sourceTimestampMs: last.timestampMs,
    points: Array.from({length: 6}, (_, step) => ({
      ts: last.timestampMs + (step + 1) * 5 * 60_000,
      sgv: last.valueMgDl + (step + 1) * [4, -2, 1, 1][index]!,
      ...(id === 'ensemble' ? {lower: last.valueMgDl - 8 - step * 3, upper: last.valueMgDl + 10 + step * 4} : {}),
    })),
    calibration: {status: 'calibrated', sampleCount: 42, within20Percent: 76 + index * 3,
      ...(id === 'ensemble' ? {coveragePercent: 88} : {})},
  })),
};

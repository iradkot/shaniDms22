export interface ForecastReading {
  readonly ts: number;
  readonly sgv: number;
}
export interface ForecastPoint extends ForecastReading {
  readonly lower?: number;
  readonly upper?: number;
}
export type ForecastSourceId =
  | 'nightscout'
  | 'loop'
  | 'personalized'
  | 'ensemble';
export interface ForecastCalibration {
  readonly status: 'calibrated' | 'uncalibrated';
  /** Independent, chronological +30 minute evaluation origins. */
  readonly sampleCount: number;
  readonly within20Percent?: number;
  readonly coveragePercent?: number;
  readonly meanAbsoluteErrorMgDl?: number;
}
export interface GlucoseForecastSeries {
  readonly id: ForecastSourceId;
  readonly label: string;
  readonly sourceTimestampMs: number;
  readonly points: readonly ForecastPoint[];
  readonly calibration: ForecastCalibration;
}
export interface ForecastDeviceStatus {
  /** Upload availability time; never read a later upload at a historical origin. */
  readonly ts: number;
  readonly loopTimestampMs?: number;
  readonly loopPrediction?: {
    readonly startMs: number;
    readonly values: readonly number[];
  };
  readonly iobUnits?: number;
  readonly iobTimestampMs?: number;
  readonly cobGrams?: number;
  readonly cobTimestampMs?: number;
}
export interface ForecastContextEvent {
  readonly kind: 'meal' | 'activity';
  readonly ts: number;
  readonly endMs?: number;
  readonly carbsGrams?: number;
  /** Latest edit time of the facts used here, to exclude later journal edits in replay. */
  readonly recordedAtMs?: number;
}
export interface GlucoseForecastSnapshot {
  readonly version: 1;
  readonly generatedAtMs: number;
  readonly glucoseTimestampMs: number;
  readonly history: readonly ForecastReading[];
  readonly series: readonly GlucoseForecastSeries[];
  readonly load?: {
    readonly iob?: number;
    readonly cob?: number;
    readonly iobTimestampMs?: number;
    readonly cobTimestampMs?: number;
  };
  readonly context: {
    readonly iobUnits?: number;
    readonly cobGrams?: number;
    readonly historyDays: number;
    readonly matchedExamples: number;
    readonly features: readonly string[];
  };
  readonly unavailableReason?: 'stale-glucose' | 'insufficient-glucose';
}
export interface GlucoseForecastInput {
  readonly nowMs: number;
  readonly glucose: readonly ForecastReading[];
  readonly deviceStatus?: readonly unknown[];
  readonly events?: readonly ForecastContextEvent[];
}

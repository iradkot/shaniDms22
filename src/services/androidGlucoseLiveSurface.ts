import {NativeModules, Platform} from 'react-native';

import {BgSample} from 'app/types/day_bgs.types';

type GlucoseNativeModule = {
  updateLiveSurface: (
    value: number,
    trend: string,
    timestampMs: number,
    iob: number,
    cob: number,
    totalBasal: number,
    totalBolus: number,
    basalBolusRatio: number,
    totalInsulin: number,
    tir: number,
    projected1: number,
    projected2: number,
    projected3: number,
    low: number,
    high: number,
  ) => void;
  clearLiveSurface: () => void;
  setWidgetThresholds: (low: number, high: number) => void;
  configureBackgroundSync: (baseUrl?: string, apiSecretSha1?: string, enabled?: boolean) => void;
  setLiveModeEnabled: (enabled: boolean) => void;
  setWidgetRangeHours?: (hours: number) => void;
  setWidgetChartStyle?: (style: string) => void;
};

type GlucoseWidgetSnapshot = {
  enrichedBg?: BgSample | null;
  predictions?: Array<{sgv: number}>;
  recentBgSamples?: BgSample[];
  insulinStats?: {
    totalBasal?: number;
    totalBolus?: number;
    basalBolusRatio?: number;
    totalInsulin?: number;
  } | null;
};

type RangeThresholds = {
  low?: number;
  high?: number;
};

type AndroidGlucoseWidgetUpdateArgs = [
  value: number,
  trend: string,
  timestampMs: number,
  iob: number,
  cob: number,
  totalBasal: number,
  totalBolus: number,
  basalBolusRatio: number,
  totalInsulin: number,
  tir: number,
  projected1: number,
  projected2: number,
  projected3: number,
  low: number,
  high: number,
];

const nativeModule: GlucoseNativeModule | undefined =
  Platform.OS === 'android' ? (NativeModules.GlucoseLiveModule as GlucoseNativeModule | undefined) : undefined;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function calculateWidgetTir(samples: BgSample[] | undefined, thresholds?: RangeThresholds): number | undefined {
  const low = finiteNumber(thresholds?.low);
  const high = finiteNumber(thresholds?.high);
  if (low == null || high == null) {
    return undefined;
  }

  let total = 0;
  let inRange = 0;
  for (const sample of samples ?? []) {
    const sgv = finiteNumber((sample as any)?.sgv);
    if (sgv == null) {
      continue;
    }
    total += 1;
    if (sgv >= low && sgv <= high) {
      inRange += 1;
    }
  }

  return total > 0 ? Math.round((inRange / total) * 100) : undefined;
}

function trendToSymbol(direction?: string): string {
  switch (direction) {
    case 'DoubleUp':
      return '⇈';
    case 'SingleUp':
      return '↑';
    case 'FortyFiveUp':
      return '↗';
    case 'Flat':
      return '→';
    case 'FortyFiveDown':
      return '↘';
    case 'SingleDown':
      return '↓';
    case 'DoubleDown':
      return '⇊';
    default:
      return '•';
  }
}

export function buildAndroidGlucoseWidgetUpdateArgs(
  snapshot?: GlucoseWidgetSnapshot | null,
  thresholds?: RangeThresholds,
): AndroidGlucoseWidgetUpdateArgs | undefined {
  const sample = snapshot?.enrichedBg;
  if (!sample) {
    return;
  }

  const rawSgv: unknown = (sample as any).sgv;
  const sgv = typeof rawSgv === 'number' ? rawSgv : Number(rawSgv);
  if (!Number.isFinite(sgv)) {
    return;
  }

  const value = Math.round(sgv);
  const trend = trendToSymbol(sample.direction);
  const timestampMs = typeof sample.date === 'number' && Number.isFinite(sample.date) ? sample.date : Date.now();

  const iob = finiteNumber(sample.iob);
  const cob = finiteNumber(sample.cob);
  const totalBasal = finiteNumber(snapshot?.insulinStats?.totalBasal);
  const totalBolus = finiteNumber(snapshot?.insulinStats?.totalBolus);
  const basalBolusRatio = finiteNumber(snapshot?.insulinStats?.basalBolusRatio);
  const totalInsulin = finiteNumber(snapshot?.insulinStats?.totalInsulin);
  const tir = calculateWidgetTir(snapshot?.recentBgSamples, thresholds);
  const p1Raw = snapshot?.predictions?.[0]?.sgv;
  const p2Raw = snapshot?.predictions?.[1]?.sgv;
  const p3Raw = snapshot?.predictions?.[2]?.sgv;
  const projected1 = typeof p1Raw === 'number' && Number.isFinite(p1Raw) ? Math.round(p1Raw) : undefined;
  const projected2 = typeof p2Raw === 'number' && Number.isFinite(p2Raw) ? Math.round(p2Raw) : undefined;
  const projected3 = typeof p3Raw === 'number' && Number.isFinite(p3Raw) ? Math.round(p3Raw) : undefined;

  const low = typeof thresholds?.low === 'number' && Number.isFinite(thresholds.low) ? thresholds.low : -1;
  const high = typeof thresholds?.high === 'number' && Number.isFinite(thresholds.high) ? thresholds.high : -1;

  return [
    value,
    trend,
    timestampMs,
    typeof iob === 'number' && Number.isFinite(iob) ? iob : -999,
    typeof cob === 'number' && Number.isFinite(cob) ? cob : -1,
    typeof totalBasal === 'number' && Number.isFinite(totalBasal) ? totalBasal : -1,
    typeof totalBolus === 'number' && Number.isFinite(totalBolus) ? totalBolus : -1,
    typeof basalBolusRatio === 'number' && Number.isFinite(basalBolusRatio) ? basalBolusRatio : -1,
    typeof totalInsulin === 'number' && Number.isFinite(totalInsulin) ? totalInsulin : -1,
    typeof tir === 'number' && Number.isFinite(tir) ? tir : -1,
    typeof projected1 === 'number' && Number.isFinite(projected1) ? projected1 : -1,
    typeof projected2 === 'number' && Number.isFinite(projected2) ? projected2 : -1,
    typeof projected3 === 'number' && Number.isFinite(projected3) ? projected3 : -1,
    low,
    high,
  ];
}

export function updateAndroidGlucoseLiveSurface(
  snapshot?: GlucoseWidgetSnapshot | null,
  thresholds?: RangeThresholds,
): void {
  if (!nativeModule) {
    return;
  }
  const args = buildAndroidGlucoseWidgetUpdateArgs(snapshot, thresholds);
  if (!args) {
    return;
  }

  try {
    nativeModule.updateLiveSurface(...args);
  } catch (err) {
    console.warn('androidGlucoseLiveSurface: updateLiveSurface failed', err);
  }
}

export function setAndroidWidgetThresholds(low?: number, high?: number): void {
  if (!nativeModule?.setWidgetThresholds) {
    return;
  }
  try {
    nativeModule.setWidgetThresholds(
      typeof low === 'number' && Number.isFinite(low) ? low : -1,
      typeof high === 'number' && Number.isFinite(high) ? high : -1,
    );
  } catch (err) {
    console.warn('androidGlucoseLiveSurface: setWidgetThresholds failed', err);
  }
}

export function configureAndroidWidgetBackgroundSync(params: {
  baseUrl?: string;
  apiSecretSha1?: string;
  enabled: boolean;
}): void {
  if (!nativeModule?.configureBackgroundSync) {
    return;
  }
  try {
    nativeModule.configureBackgroundSync(
      params.baseUrl,
      params.apiSecretSha1,
      params.enabled,
    );
  } catch (err) {
    console.warn('androidGlucoseLiveSurface: configureBackgroundSync failed', err);
  }
}

export function setAndroidWidgetLiveModeEnabled(enabled: boolean): void {
  if (!nativeModule?.setLiveModeEnabled) {
    return;
  }
  try {
    nativeModule.setLiveModeEnabled(enabled);
  } catch (err) {
    console.warn('androidGlucoseLiveSurface: setLiveModeEnabled failed', err);
  }
}

export function setAndroidWidgetRangeHours(hours: number): void {
  if (!nativeModule?.setWidgetRangeHours) {
    return;
  }
  try {
    const clamped = Math.max(1, Math.min(12, Math.round(hours)));
    nativeModule.setWidgetRangeHours(clamped);
  } catch (err) {
    console.warn('androidGlucoseLiveSurface: setWidgetRangeHours failed', err);
  }
}

export function setAndroidWidgetChartStyle(style: 'line' | 'points'): void {
  if (!nativeModule?.setWidgetChartStyle) {
    return;
  }
  try {
    nativeModule.setWidgetChartStyle(style === 'points' ? 'points' : 'line');
  } catch (err) {
    console.warn('androidGlucoseLiveSurface: setWidgetChartStyle failed', err);
  }
}

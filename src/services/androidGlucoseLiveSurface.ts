import {NativeModules, Platform} from 'react-native';

import {BgSample} from 'app/types/day_bgs.types';

type GlucoseNativeModule = {
  updateLiveSurface: (
    value: number,
    trend: string,
    timestampMs: number,
    iob?: number,
    cob?: number,
    projected1?: number,
    projected2?: number,
    projected3?: number,
    low?: number,
    high?: number,
  ) => void;
  clearLiveSurface: () => void;
  setWidgetThresholds: (low?: number, high?: number) => void;
  configureBackgroundSync: (baseUrl?: string, apiSecretSha1?: string, enabled?: boolean) => void;
};

type GlucoseWidgetSnapshot = {
  enrichedBg?: BgSample | null;
  predictions?: Array<{sgv: number}>;
};

type RangeThresholds = {
  low?: number;
  high?: number;
};

const nativeModule: GlucoseNativeModule | undefined =
  Platform.OS === 'android' ? (NativeModules.GlucoseLiveModule as GlucoseNativeModule | undefined) : undefined;

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

export function updateAndroidGlucoseLiveSurface(
  snapshot?: GlucoseWidgetSnapshot | null,
  thresholds?: RangeThresholds,
): void {
  if (!nativeModule) return;

  const sample = snapshot?.enrichedBg;
  if (!sample) return;

  const rawSgv: unknown = (sample as any).sgv;
  const sgv = typeof rawSgv === 'number' ? rawSgv : Number(rawSgv);
  if (!Number.isFinite(sgv)) return;

  const value = Math.round(sgv);
  const trend = trendToSymbol(sample.direction);
  const timestampMs = typeof sample.date === 'number' && Number.isFinite(sample.date) ? sample.date : Date.now();

  const iob = typeof sample.iob === 'number' && Number.isFinite(sample.iob) ? sample.iob : undefined;
  const cob = typeof sample.cob === 'number' && Number.isFinite(sample.cob) ? sample.cob : undefined;
  const p1Raw = snapshot?.predictions?.[0]?.sgv;
  const p2Raw = snapshot?.predictions?.[1]?.sgv;
  const p3Raw = snapshot?.predictions?.[2]?.sgv;
  const projected1 = typeof p1Raw === 'number' && Number.isFinite(p1Raw) ? Math.round(p1Raw) : undefined;
  const projected2 = typeof p2Raw === 'number' && Number.isFinite(p2Raw) ? Math.round(p2Raw) : undefined;
  const projected3 = typeof p3Raw === 'number' && Number.isFinite(p3Raw) ? Math.round(p3Raw) : undefined;

  const low = typeof thresholds?.low === 'number' && Number.isFinite(thresholds.low) ? thresholds.low : undefined;
  const high = typeof thresholds?.high === 'number' && Number.isFinite(thresholds.high) ? thresholds.high : undefined;

  try {
    nativeModule.updateLiveSurface(
      value,
      trend,
      timestampMs,
      iob,
      cob,
      projected1,
      projected2,
      projected3,
      low,
      high,
    );
  } catch (err) {
    console.warn('androidGlucoseLiveSurface: updateLiveSurface failed', err);
  }
}

export function setAndroidWidgetThresholds(low?: number, high?: number): void {
  if (!nativeModule?.setWidgetThresholds) return;
  try {
    nativeModule.setWidgetThresholds(low, high);
  } catch (err) {
    console.warn('androidGlucoseLiveSurface: setWidgetThresholds failed', err);
  }
}

export function configureAndroidWidgetBackgroundSync(params: {
  baseUrl?: string;
  apiSecretSha1?: string;
  enabled: boolean;
}): void {
  if (!nativeModule?.configureBackgroundSync) return;
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

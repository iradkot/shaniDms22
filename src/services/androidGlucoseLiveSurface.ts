import {NativeModules, Platform} from 'react-native';

import {BgSample} from 'app/types/day_bgs.types';

type GlucoseNativeModule = {
  updateLiveSurface: (
    value: number,
    trend: string,
    timestampMs: number,
    iob?: number,
    cob?: number,
    projected?: number,
  ) => void;
  clearLiveSurface: () => void;
};

type GlucoseWidgetSnapshot = {
  enrichedBg?: BgSample | null;
  predictions?: Array<{sgv: number}>;
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

export function updateAndroidGlucoseLiveSurface(snapshot?: GlucoseWidgetSnapshot | null): void {
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
  const projectedRaw = snapshot?.predictions?.[0]?.sgv;
  const projected = typeof projectedRaw === 'number' && Number.isFinite(projectedRaw) ? Math.round(projectedRaw) : undefined;

  nativeModule.updateLiveSurface(value, trend, timestampMs, iob, cob, projected);
}

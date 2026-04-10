import {NativeModules, Platform} from 'react-native';

import {BgSample} from 'app/types/day_bgs.types';

type GlucoseNativeModule = {
  updateLiveSurface: (value: number, trend: string, timestampMs: number) => void;
  clearLiveSurface: () => void;
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

export function updateAndroidGlucoseLiveSurface(sample?: BgSample | null): void {
  if (!nativeModule) return;

  if (!sample) return;

  const rawSgv: unknown = (sample as any).sgv;
  const sgv = typeof rawSgv === 'number' ? rawSgv : Number(rawSgv);
  if (!Number.isFinite(sgv)) return;

  const value = Math.round(sgv);
  const trend = trendToSymbol(sample.direction);
  const timestampMs = typeof sample.date === 'number' && Number.isFinite(sample.date) ? sample.date : Date.now();

  nativeModule.updateLiveSurface(value, trend, timestampMs);
}

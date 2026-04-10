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

  if (!sample || typeof sample.sgv !== 'number' || !Number.isFinite(sample.sgv)) {
    nativeModule.clearLiveSurface();
    return;
  }

  const value = Math.round(sample.sgv);
  const trend = trendToSymbol(sample.direction);
  const timestampMs = typeof sample.date === 'number' && Number.isFinite(sample.date) ? sample.date : Date.now();

  nativeModule.updateLiveSurface(value, trend, timestampMs);
}

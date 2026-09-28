import {useEffect} from 'react';
import {Platform} from 'react-native';

import {LatestNightscoutSnapshot} from 'app/hooks/useLatestNightscoutSnapshot';
import {updateAndroidGlucoseLiveSurface} from 'app/services/androidGlucoseLiveSurface';

export function useAndroidGlucoseLiveSurface(
  snapshot?: LatestNightscoutSnapshot | null,
  thresholds?: {low?: number; high?: number},
): void {
  const low = thresholds?.low;
  const high = thresholds?.high;
  useEffect(() => {
    if (Platform.OS !== 'android') {return;}
    if (!snapshot?.enrichedBg) {
      // A foreground load starts empty even when native sync has valid data.
      // Account changes/logout clear native data through configureBackgroundSync.
      return;
    }
    updateAndroidGlucoseLiveSurface(
      snapshot,
      low === undefined && high === undefined
        ? undefined
        : {
            ...(low === undefined ? {} : {low}),
            ...(high === undefined ? {} : {high}),
          },
    );
  }, [snapshot, low, high]);
}

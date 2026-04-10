import {useEffect} from 'react';
import {Platform} from 'react-native';

import {LatestNightscoutSnapshot} from 'app/hooks/useLatestNightscoutSnapshot';
import {updateAndroidGlucoseLiveSurface} from 'app/services/androidGlucoseLiveSurface';

export function useAndroidGlucoseLiveSurface(
  snapshot?: LatestNightscoutSnapshot | null,
  thresholds?: {low?: number; high?: number},
): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!snapshot?.enrichedBg) return;
    updateAndroidGlucoseLiveSurface(snapshot, thresholds);
  }, [snapshot, thresholds?.low, thresholds?.high]);
}

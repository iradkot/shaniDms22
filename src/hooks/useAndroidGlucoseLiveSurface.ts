import {useEffect} from 'react';
import {Platform} from 'react-native';

import {LatestNightscoutSnapshot} from 'app/hooks/useLatestNightscoutSnapshot';
import {updateAndroidGlucoseLiveSurface} from 'app/services/androidGlucoseLiveSurface';

export function useAndroidGlucoseLiveSurface(snapshot?: LatestNightscoutSnapshot | null): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!snapshot?.enrichedBg) return;
    updateAndroidGlucoseLiveSurface(snapshot);
  }, [snapshot]);
}

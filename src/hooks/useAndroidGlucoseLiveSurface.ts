import {useEffect} from 'react';
import {Platform} from 'react-native';

import {BgSample} from 'app/types/day_bgs.types';
import {updateAndroidGlucoseLiveSurface} from 'app/services/androidGlucoseLiveSurface';

export function useAndroidGlucoseLiveSurface(sample?: BgSample | null): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    updateAndroidGlucoseLiveSurface(sample ?? null);
  }, [sample]);
}

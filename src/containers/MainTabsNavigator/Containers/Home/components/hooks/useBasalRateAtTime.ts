import {useMemo} from 'react';

import type {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import {getEffectiveBasalRateAt} from 'app/utils/insulin.utils/basalDeliveryTimeline';

export function useBasalRateAtTime(params: {
  /** When false, returns null (avoids work when tooltip isn't visible). */
  enabled: boolean;

  /** Epoch milliseconds. */
  timeMs: number | null;

  insulinData?: InsulinDataEntry[];
  basalProfileData?: BasalProfile;
}): number | null {
  const {enabled, timeMs, insulinData, basalProfileData} = params;

  return useMemo(() => {
    if (!enabled) return null;
    if (timeMs == null || !Number.isFinite(timeMs)) return null;

    return getEffectiveBasalRateAt({
      basalProfile: basalProfileData ?? [],
      insulinData,
      timeMs,
    });
  }, [basalProfileData, enabled, insulinData, timeMs]);
}

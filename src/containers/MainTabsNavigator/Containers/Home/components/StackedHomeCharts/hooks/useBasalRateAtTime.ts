import {useMemo} from 'react';

import type {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import {
  buildBasalDeliveryTimeline,
  getEffectiveBasalRateAt,
} from 'app/utils/insulin.utils/basalDeliveryTimeline';

export function useBasalRateAtTime(params: {
  /** When false, returns null. The range model is retained for the next touch. */
  enabled: boolean;

  /** Epoch milliseconds. */
  timeMs: number | null;
  domain: [Date, Date];

  insulinData?: InsulinDataEntry[] | undefined;
  basalProfileData?: BasalProfile | undefined;
}): number | null {
  const {enabled, timeMs, insulinData, basalProfileData, domain} = params;
  const startMs = +domain[0];
  const endMs = +domain[1];
  // Use the same delivery model as the lanes; source records are prepared once
  // for this range, instead of reparsed and sorted for every finger movement.
  const timeline = useMemo(
    () =>
      buildBasalDeliveryTimeline({
        basalProfile: basalProfileData ?? [],
        ...(insulinData ? {insulinData} : {}),
        startDate: new Date(startMs),
        endDate: new Date(endMs + 1),
      }),
    [basalProfileData, insulinData, startMs, endMs],
  );

  return useMemo(() => {
    if (!enabled) {
      return null;
    }
    if (timeMs == null || !Number.isFinite(timeMs)) {
      return null;
    }

    if (timeMs >= startMs && timeMs <= endMs) {
      const segment = timeline.find(
        item => item.startMs <= timeMs && item.endMs > timeMs,
      );
      return segment?.source === 'scheduled' && !basalProfileData?.length
        ? null
        : segment?.rate ?? null;
    }
    return getEffectiveBasalRateAt({
      basalProfile: basalProfileData ?? [],
      ...(insulinData ? {insulinData} : {}),
      timeMs,
    });
  }, [
    basalProfileData,
    enabled,
    insulinData,
    timeMs,
    timeline,
    startMs,
    endMs,
  ]);
}

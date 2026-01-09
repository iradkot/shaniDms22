import {useMemo} from 'react';

import type {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';

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

    const tempBasals = (insulinData ?? [])
      .filter(e => e.type === 'tempBasal')
      .map(e => {
        const startMs = e.startTime
          ? Date.parse(e.startTime)
          : e.timestamp
            ? Date.parse(e.timestamp)
            : NaN;

        const durationMin =
          typeof e.duration === 'number' && Number.isFinite(e.duration) ? e.duration : 0;

        const endMs = e.endTime
          ? Date.parse(e.endTime)
          : Number.isFinite(startMs) && durationMin > 0
            ? startMs + durationMin * 60_000
            : NaN;

        const rate = typeof e.rate === 'number' && Number.isFinite(e.rate) ? e.rate : NaN;
        return {startMs, endMs, rate};
      })
      .filter(x => Number.isFinite(x.startMs) && Number.isFinite(x.rate));

    const activeTemp = tempBasals
      .filter(x => Number.isFinite(x.endMs) && timeMs >= x.startMs && timeMs <= x.endMs)
      .sort((a, b) => b.startMs - a.startMs)[0];

    if (activeTemp && Number.isFinite(activeTemp.rate)) {
      return activeTemp.rate;
    }

    if (!basalProfileData?.length) return null;

    const d = new Date(timeMs);
    const seconds = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();

    const sorted = [...basalProfileData]
      .map(e => {
        const sec =
          typeof e.timeAsSeconds === 'number' && Number.isFinite(e.timeAsSeconds)
            ? e.timeAsSeconds
            : (() => {
                const [hh, mm] = String(e.time).split(':');
                const h = parseInt(hh, 10);
                const m = parseInt(mm, 10);
                return (Number.isFinite(h) ? h : 0) * 3600 + (Number.isFinite(m) ? m : 0) * 60;
              })();

        return {value: e.value, sec};
      })
      .sort((a, b) => a.sec - b.sec);

    const match = [...sorted].reverse().find(e => e.sec <= seconds) ?? sorted[sorted.length - 1];
    return typeof match?.value === 'number' && Number.isFinite(match.value) ? match.value : null;
  }, [basalProfileData, enabled, insulinData, timeMs]);
}

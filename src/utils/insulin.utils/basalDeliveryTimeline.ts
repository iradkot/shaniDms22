import type {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';

export type BasalDeliverySource = 'scheduled' | 'tempBasal' | 'suspendPump';

export type BasalDeliverySegment = {
  startMs: number;
  endMs: number;
  rate: number;
  source: BasalDeliverySource;
};

type BasalOverride = BasalDeliverySegment & {order: number};

const MINUTE_MS = 60_000;

function parseProfileSeconds(time: string, timeAsSeconds?: number): number {
  if (typeof timeAsSeconds === 'number' && Number.isFinite(timeAsSeconds)) {
    return Math.max(0, Math.min(86_399, timeAsSeconds));
  }

  const [hoursRaw, minutesRaw] = String(time).split(':');
  const hours = Number.parseInt(hoursRaw, 10);
  const minutes = Number.parseInt(minutesRaw, 10);
  return Math.max(
    0,
    Math.min(
      86_399,
      (Number.isFinite(hours) ? hours : 0) * 3600 +
        (Number.isFinite(minutes) ? minutes : 0) * 60,
    ),
  );
}

function getSortedProfile(basalProfile: BasalProfile) {
  return basalProfile
    .filter(entry => typeof entry.value === 'number' && Number.isFinite(entry.value))
    .map(entry => ({
      rate: Math.max(0, entry.value),
      seconds: parseProfileSeconds(entry.time, entry.timeAsSeconds),
    }))
    .sort((a, b) => a.seconds - b.seconds);
}

export function getScheduledBasalRateAt(
  basalProfile: BasalProfile,
  timeMs: number,
): number {
  const profile = getSortedProfile(basalProfile);
  if (!profile.length || !Number.isFinite(timeMs)) return 0;

  const date = new Date(timeMs);
  const seconds =
    date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
  const match =
    [...profile].reverse().find(entry => entry.seconds <= seconds) ??
    profile[profile.length - 1];
  return match.rate;
}

function parseEntryStart(entry: InsulinDataEntry): number {
  const value = entry.startTime ?? entry.timestamp;
  return value ? Date.parse(value) : NaN;
}

function parseEntryEnd(entry: InsulinDataEntry, startMs: number): number {
  if (entry.endTime) {
    const explicitEnd = Date.parse(entry.endTime);
    if (Number.isFinite(explicitEnd)) return explicitEnd;
  }
  if (typeof entry.duration === 'number' && Number.isFinite(entry.duration)) {
    return startMs + Math.max(0, entry.duration) * MINUTE_MS;
  }
  return NaN;
}

function buildOverrides(
  insulinData: InsulinDataEntry[],
  rangeStartMs: number,
  rangeEndMs: number,
): BasalOverride[] {
  const raw = insulinData
    .map((entry, order) => {
      if (entry.type !== 'tempBasal' && entry.type !== 'suspendPump') return null;
      const startMs = parseEntryStart(entry);
      if (!Number.isFinite(startMs)) return null;

      const rate =
        entry.type === 'suspendPump'
          ? 0
          : typeof entry.rate === 'number' && Number.isFinite(entry.rate)
            ? Math.max(0, entry.rate)
            : 0;
      return {
        startMs,
        endMs: parseEntryEnd(entry, startMs),
        rate,
        source: entry.type,
        order,
      } satisfies BasalOverride;
    })
    .filter((entry): entry is BasalOverride => entry !== null)
    .sort((a, b) => a.startMs - b.startMs || a.order - b.order);

  return raw
    .map((entry, index) => {
      const nextStartMs = raw[index + 1]?.startMs;
      const ownEndMs = Number.isFinite(entry.endMs) ? entry.endMs : rangeEndMs;
      const effectiveEndMs =
        nextStartMs != null && nextStartMs >= entry.startMs
          ? Math.min(ownEndMs, nextStartMs)
          : ownEndMs;
      return {
        ...entry,
        startMs: Math.max(rangeStartMs, entry.startMs),
        endMs: Math.min(rangeEndMs, effectiveEndMs),
      };
    })
    .filter(entry => entry.endMs > entry.startMs);
}

function addProfileBoundaries(
  boundaries: Set<number>,
  basalProfile: BasalProfile,
  rangeStartMs: number,
  rangeEndMs: number,
) {
  const profile = getSortedProfile(basalProfile);
  if (!profile.length) return;

  const cursor = new Date(rangeStartMs);
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getTime() < rangeEndMs) {
    for (const entry of profile) {
      const boundary = new Date(cursor);
      const hours = Math.floor(entry.seconds / 3600);
      const minutes = Math.floor((entry.seconds % 3600) / 60);
      const seconds = entry.seconds % 60;
      boundary.setHours(hours, minutes, seconds, 0);
      const boundaryMs = boundary.getTime();
      if (boundaryMs > rangeStartMs && boundaryMs < rangeEndMs) {
        boundaries.add(boundaryMs);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
}

export function buildBasalDeliveryTimeline(params: {
  basalProfile: BasalProfile;
  insulinData?: InsulinDataEntry[];
  startDate: Date;
  endDate: Date;
}): BasalDeliverySegment[] {
  const {basalProfile, insulinData = [], startDate, endDate} = params;
  const rangeStartMs = startDate.getTime();
  const rangeEndMs = endDate.getTime();
  if (
    !Number.isFinite(rangeStartMs) ||
    !Number.isFinite(rangeEndMs) ||
    rangeEndMs <= rangeStartMs
  ) {
    return [];
  }

  const overrides = buildOverrides(insulinData, rangeStartMs, rangeEndMs);
  const boundaries = new Set<number>([rangeStartMs, rangeEndMs]);
  addProfileBoundaries(boundaries, basalProfile, rangeStartMs, rangeEndMs);
  overrides.forEach(entry => {
    boundaries.add(entry.startMs);
    boundaries.add(entry.endMs);
  });

  const points = [...boundaries].sort((a, b) => a - b);
  const segments: BasalDeliverySegment[] = [];

  for (let index = 0; index < points.length - 1; index++) {
    const startMs = points[index];
    const endMs = points[index + 1];
    if (endMs <= startMs) continue;

    const activeOverride = overrides.find(
      entry => entry.startMs <= startMs && entry.endMs > startMs,
    );
    const next: BasalDeliverySegment = activeOverride
      ? {
          startMs,
          endMs,
          rate: activeOverride.rate,
          source: activeOverride.source,
        }
      : {
          startMs,
          endMs,
          rate: getScheduledBasalRateAt(basalProfile, startMs),
          source: 'scheduled',
        };

    const previous = segments[segments.length - 1];
    if (
      previous &&
      previous.endMs === next.startMs &&
      previous.rate === next.rate &&
      previous.source === next.source
    ) {
      previous.endMs = next.endMs;
    } else {
      segments.push(next);
    }
  }

  return segments;
}

export function sumBasalDelivery(segments: BasalDeliverySegment[]): number {
  return segments.reduce(
    (total, segment) =>
      total + segment.rate * ((segment.endMs - segment.startMs) / 3_600_000),
    0,
  );
}

export function getEffectiveBasalRateAt(params: {
  basalProfile: BasalProfile;
  insulinData?: InsulinDataEntry[];
  timeMs: number;
}): number | null {
  const {basalProfile, insulinData, timeMs} = params;
  if (!Number.isFinite(timeMs)) return null;
  const segment = buildBasalDeliveryTimeline({
    basalProfile,
    insulinData,
    startDate: new Date(timeMs),
    endDate: new Date(timeMs + 1),
  })[0];
  if (segment?.source === 'scheduled' && basalProfile.length === 0) {
    return null;
  }
  return segment?.rate ?? null;
}

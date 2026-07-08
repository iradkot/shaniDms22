import {DeviceStatusEntry} from 'app/types/deviceStatus.types';
import {
  BasalMode,
  LOOP_DATA_FETCH_CHUNK_DAYS,
  LoopDataFetchRange,
  LoopMode,
  LoopModeEvent,
} from './loopModeStats.types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function readNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'on', 'closed', 'closedloop'].includes(normalized)) {
      return true;
    }
    if (['false', 'no', 'off', 'open', 'openloop'].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function readTimestampMs(entry: DeviceStatusEntry): number | null {
  const mills = readNumber(entry.mills);
  if (mills != null) {
    return mills > 1e12 ? mills : mills * 1000;
  }

  const createdAt =
    typeof entry.created_at === 'string' ? Date.parse(entry.created_at) : NaN;
  return Number.isFinite(createdAt) ? createdAt : null;
}

function classifyModeFromDeviceStatus(entry: DeviceStatusEntry): LoopMode {
  const loop = asRecord(entry.loop);
  const openaps = asRecord(entry.openaps);

  const explicitLoopClosed =
    readBoolean(loop?.closedLoop) ??
    readBoolean(loop?.isClosedLoop) ??
    readBoolean(loop?.dosingEnabled) ??
    readBoolean(loop?.automaticDosingStatus) ??
    readBoolean(loop?.loopStatus) ??
    readBoolean(loop?.status);
  if (explicitLoopClosed != null) {
    return explicitLoopClosed ? 'closed' : 'open';
  }

  const loopEnacted = asRecord(loop?.enacted);
  const loopRecommendation = asRecord(loop?.automaticDoseRecommendation);
  if (loopEnacted) {
    return loopEnacted.received === false ? 'open' : 'closed';
  }
  if (loopRecommendation) {
    return 'open';
  }

  const openapsEnacted = asRecord(openaps?.enacted);
  if (openapsEnacted) {
    return openapsEnacted.received === false ? 'open' : 'closed';
  }
  if (asRecord(openaps?.suggested)) {
    return 'open';
  }

  return 'unknown';
}

function classifyBasalRecord(
  record: Record<string, unknown> | null,
): {mode: BasalMode; durationMinutes: number | null} | null {
  if (!record) {
    return null;
  }

  const adjustment =
    asRecord(record.tempBasalAdjustment) ??
    asRecord(record.basalAdjustment) ??
    asRecord(record.tempBasal) ??
    record;
  const rate =
    readNumber(adjustment.rate) ??
    readNumber(adjustment.absolute) ??
    readNumber(adjustment.unitsPerHour);
  const duration =
    readNumber(adjustment.duration) ??
    readNumber(adjustment.durationMinutes) ??
    readNumber(adjustment.minutes);

  if (duration == null || duration <= 0) {
    return null;
  }

  return {
    mode: rate === 0 ? 'suspended' : 'temp',
    durationMinutes: duration,
  };
}

function classifyBasalModeFromDeviceStatus(
  entry: DeviceStatusEntry,
): {mode: BasalMode; durationMinutes: number | null} {
  const pump = asRecord(entry.pump);
  if (pump?.suspended === true) {
    return {mode: 'suspended', durationMinutes: null};
  }

  const loop = asRecord(entry.loop);
  const openaps = asRecord(entry.openaps);
  const enacted = asRecord(loop?.enacted) ?? asRecord(openaps?.enacted);
  const enactedReceived = enacted && enacted.received !== false;
  const enactedBasal = classifyBasalRecord(enactedReceived ? enacted : null);
  if (enactedBasal) {
    return enactedBasal;
  }

  const recommendedBasal =
    classifyBasalRecord(asRecord(loop?.automaticDoseRecommendation)) ??
    classifyBasalRecord(asRecord(openaps?.suggested));
  if (recommendedBasal) {
    return recommendedBasal;
  }

  return pump?.suspended === false
    ? {mode: 'planned', durationMinutes: null}
    : {mode: 'unknown', durationMinutes: null};
}

export function buildLoopDataFetchRanges({
  start,
  end,
  lookbackMinutes,
  chunkDays = LOOP_DATA_FETCH_CHUNK_DAYS,
}: {
  start: Date;
  end: Date;
  lookbackMinutes: number;
  chunkDays?: number;
}): LoopDataFetchRange[] {
  const fetchStart = new Date(start.getTime() - lookbackMinutes * 60000);
  const safeChunkDays = Math.max(1, Math.floor(chunkDays));
  const ranges: LoopDataFetchRange[] = [];
  let cursor = fetchStart;

  while (cursor.getTime() <= end.getTime()) {
    const chunkStart = new Date(cursor);
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setDate(chunkEnd.getDate() + safeChunkDays);
    chunkEnd.setMilliseconds(chunkEnd.getMilliseconds() - 1);

    if (chunkEnd.getTime() > end.getTime()) {
      chunkEnd.setTime(end.getTime());
    }

    ranges.push({start: chunkStart, end: chunkEnd});
    cursor = new Date(chunkEnd.getTime() + 1);
  }

  return ranges;
}

export function buildLoopModeEventsFromDeviceStatus(
  status: DeviceStatusEntry[],
): LoopModeEvent[] {
  return status
    .map((entry): LoopModeEvent | null => {
      const timestamp = readTimestampMs(entry);
      if (timestamp == null) {
        return null;
      }

      const basal = classifyBasalModeFromDeviceStatus(entry);
      const mode = classifyModeFromDeviceStatus(entry);

      return {
        timestamp,
        mode,
        basalMode: basal.mode,
        basalDurationMinutes: basal.durationMinutes,
      };
    })
    .filter((event): event is LoopModeEvent => event !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function buildLoopModeEventsFromTreatments(
  treatments: Array<Record<string, unknown>>,
): LoopModeEvent[] {
  return treatments
    .map((treatment): LoopModeEvent | null => {
      const eventType =
        typeof treatment.eventType === 'string'
          ? treatment.eventType.toLowerCase()
          : '';
      const enteredBy =
        typeof treatment.enteredBy === 'string'
          ? treatment.enteredBy.toLowerCase()
          : '';
      const durationMinutes = readNumber(treatment.duration);
      const createdAt =
        typeof treatment.created_at === 'string'
          ? Date.parse(treatment.created_at)
          : NaN;
      const timestamp =
        Number.isFinite(createdAt) && createdAt > 0
          ? createdAt
          : typeof treatment.timestamp === 'string'
            ? Date.parse(treatment.timestamp)
            : NaN;

      if (
        eventType !== 'temp basal' ||
        treatment.automatic !== true ||
        !enteredBy.includes('loop') ||
        durationMinutes == null ||
        durationMinutes <= 0 ||
        !Number.isFinite(timestamp)
      ) {
        return null;
      }

      const rate =
        readNumber(treatment.rate) ??
        readNumber(treatment.absolute) ??
        readNumber(treatment.amount);

      return {
        timestamp,
        mode: 'closed',
        basalMode: rate === 0 ? 'suspended' : 'temp',
        basalDurationMinutes: durationMinutes,
        modeDurationMinutes: durationMinutes,
      };
    })
    .filter((event): event is LoopModeEvent => event !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

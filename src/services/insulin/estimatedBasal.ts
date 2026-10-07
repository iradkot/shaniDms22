import {
  buildRecordedBasalSegments,
  deduplicateInsulinRecords,
  getInsulinEndMs,
  getInsulinStartMs,
  getRecordedBasalIntervals,
  parseInsulinNumber,
} from './recordedInsulin';

export interface EstimatedBasalProfile {
  entries: readonly {time: string; timeAsSeconds?: number; value: number}[];
  timeZone?: string;
  /** Complete effective schedules: a carry-in at/before start plus every later update. */
  history?: readonly {
    startMs: number;
    entries: EstimatedBasalProfile['entries'];
    timeZone?: string;
  }[];
  /** Inclusive upper bound checked by the profile transport. */
  verifiedThroughMs?: number;
}

type Period = {startMs: number; endMs: number};
type Treatment = Readonly<Record<string, unknown>>;
type ScheduleEntry = {seconds: number; rate: number};
type Control = {
  startMs: number;
  endMs: number;
  kind: 'schedule' | 'absolute' | 'percent' | 'unknown';
  value?: number;
};
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const DAY_SECONDS = 86_400;

const signedNumber = (value: unknown): number | undefined => {
  if (
    typeof value !== 'number' &&
    !(
      typeof value === 'string' &&
      /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
    )
  ) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseSchedule = (
  profile: EstimatedBasalProfile,
): ScheduleEntry[] | undefined => {
  if (!profile || !Array.isArray(profile.entries) || !profile.entries.length) {
    return undefined;
  }
  const entries: ScheduleEntry[] = [];
  for (const entry of profile.entries) {
    if (!entry || typeof entry !== 'object') {
      return undefined;
    }
    const match =
      typeof entry.time === 'string'
        ? /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(entry.time)
        : null;
    if (
      !match ||
      Number(match[1]) > 23 ||
      Number(match[2]) > 59 ||
      Number(match[3] ?? 0) > 59 ||
      typeof entry.value !== 'number' ||
      !Number.isFinite(entry.value) ||
      entry.value < 0
    ) {
      return undefined;
    }
    const seconds =
      Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0);
    if (
      entry.timeAsSeconds !== undefined &&
      (!Number.isInteger(entry.timeAsSeconds) ||
        entry.timeAsSeconds !== seconds)
    ) {
      return undefined;
    }
    // Match the native widget's conservative schedule contract. Duplicate
    // entries are ambiguous even when their currently supplied rates agree.
    if (entries.some(item => item.seconds === seconds)) {
      return undefined;
    }
    entries.push({seconds, rate: entry.value});
  }
  entries.sort((left, right) => left.seconds - right.seconds);
  return entries[0]?.seconds === 0 ? entries : undefined;
};

type Clock = (timeMs: number) => {seconds: number; offsetMs: number};

/** Resolve the profile's clock, independently of the device's current zone. */
const buildClock = (timeZone: string | undefined): Clock | undefined => {
  if (timeZone === undefined) {
    return timeMs => {
      const date = new Date(timeMs);
      return {
        seconds:
          date.getHours() * 3600 +
          date.getMinutes() * 60 +
          date.getSeconds() +
          date.getMilliseconds() / 1000,
        offsetMs: -date.getTimezoneOffset() * MINUTE_MS,
      };
    };
  }
  if (typeof timeZone !== 'string' || !timeZone.trim()) {
    return undefined;
  }
  // Loop/Trio can upload GMT+H or GMT+H:MM instead of an IANA zone.
  // These use the ordinary offset sign, whereas Etc/GMT uses the reverse sign.
  const offset =
    /^(?:GMT|UTC)([+-])(\d{1,2})(?::(\d{2}))?$/i.exec(timeZone) ??
    /^([+-])(\d{2}):(\d{2})$/.exec(timeZone);
  if (offset) {
    const hours = Number(offset[2]);
    const minutes = Number(offset[3] ?? 0);
    if (hours > 23 || minutes > 59) {
      return undefined;
    }
    const offsetMs =
      (hours * 60 + minutes) * MINUTE_MS * (offset[1] === '-' ? -1 : 1);
    return timeMs => ({
      seconds:
        ((((timeMs + offsetMs) % (DAY_SECONDS * 1000)) + DAY_SECONDS * 1000) %
          (DAY_SECONDS * 1000)) /
        1000,
      offsetMs,
    });
  }
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone.replace(/^ETC\//, 'Etc/'),
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    if (!formatter.resolvedOptions().timeZone) {
      return undefined;
    }
    return timeMs => {
      const parts = formatter.formatToParts(new Date(timeMs));
      const part = (name: Intl.DateTimeFormatPartTypes): number =>
        Number(parts.find(item => item.type === name)?.value);
      const hour = part('hour');
      const minute = part('minute');
      const second = part('second');
      const millisecond = ((timeMs % 1000) + 1000) % 1000;
      const local = Date.UTC(
        part('year'),
        part('month') - 1,
        part('day'),
        hour,
        minute,
        second,
      );
      if (
        !Number.isFinite(local) ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59 ||
        second < 0 ||
        second > 59
      ) {
        throw new Error('Unsupported profile clock');
      }
      return {
        seconds: hour * 3600 + minute * 60 + second + millisecond / 1000,
        offsetMs: local + millisecond - timeMs,
      };
    };
  } catch {
    return undefined;
  }
};

const buildControls = (
  records: readonly Treatment[],
  period: Period,
  observedAtMs: number,
): {controls: Control[]; invalidAmounts: Period[]} | undefined => {
  const controls: Control[] = [];
  const invalidAmounts: Period[] = [];
  for (const record of deduplicateInsulinRecords(records)) {
    if (record.isValid === false || record.deleted === true) {
      continue;
    }
    const type = typeof record.eventType === 'string' ? record.eventType : '';
    const profileChange = /^Profile\s*(Switch|Change)$/i.test(type);
    if (
      !profileChange &&
      !/basal|suspend.*pump|pump.*suspend|resume.*pump|pump.*resume/i.test(type)
    ) {
      continue;
    }
    const startMs = getInsulinStartMs(record);
    if (!Number.isFinite(startMs)) {
      return undefined;
    }
    if (startMs >= period.endMs) {
      continue;
    }
    // Default-profile upload history does not resolve treatment Profile Switch
    // selection, percentages or temporary restoration semantics.
    if (profileChange) {
      const hasLifetime =
        record.endDate != null ||
        record.endTime != null ||
        record.duration != null;
      const endMs = hasLifetime ? getInsulinEndMs(record, startMs) : startMs;
      if (
        !Number.isFinite(endMs) ||
        endMs < startMs ||
        endMs === startMs ||
        endMs > period.startMs
      ) {
        // Permanent switches can select another profile/percentage before the
        // range; fetching defaultProfile does not resolve that selection.
        // Temporary switches can restore a different profile when they expire.
        // This one-profile contract permits known, already-expired switches.
        return undefined;
      }
      continue;
    }
    if (/^(?:Resume\s*Pump|Pump\s*Resume)$/i.test(type)) {
      controls.push({startMs, endMs: startMs, kind: 'schedule'});
      continue;
    }
    const hasLifetime =
      record.endDate != null ||
      record.endTime != null ||
      record.duration != null;
    const endMs = hasLifetime ? getInsulinEndMs(record, startMs) : Infinity;
    const validEnd = Number.isFinite(endMs) && endMs >= startMs;
    if (/^(?:Suspend\s*Pump|Pump\s*Suspend)$/i.test(type)) {
      controls.push({
        startMs,
        // An open suspend remains active until the next control/resume.
        endMs:
          !hasLifetime || !validEnd || endMs === startMs ? Infinity : endMs,
        kind: !hasLifetime || validEnd ? 'absolute' : 'unknown',
        value: 0,
      });
      continue;
    }
    if (!/^(Temp Basal|Basal)$/i.test(type) || !validEnd) {
      controls.push({startMs, endMs: Infinity, kind: 'unknown'});
      continue;
    }
    // A zero-duration temp is a cancellation, not a zero-rate interval.
    if (endMs === startMs) {
      controls.push({startMs, endMs, kind: 'schedule'});
      continue;
    }
    const loop =
      typeof record.enteredBy === 'string' &&
      record.enteredBy.toLowerCase().startsWith('loop://');
    const amount = record.deliveredUnits ?? (loop ? record.amount : undefined);
    const completed =
      record.isMutable !== true &&
      record.mutable !== true &&
      endMs <= observedAtMs;
    if (
      completed &&
      amount != null &&
      parseInsulinNumber(amount) === undefined
    ) {
      invalidAmounts.push({startMs, endMs});
    }
    // Nightscout percent is the change from the schedule: -100 = suspended,
    // +50 = 1.5 times scheduled. Absolute rates take precedence (NS profilefunctions).
    if (record.absolute != null) {
      const value = parseInsulinNumber(record.absolute);
      controls.push({
        startMs,
        endMs,
        kind: value === undefined ? 'unknown' : 'absolute',
        ...(value === undefined ? {} : {value}),
      });
    } else if (record.percent != null || record.temp === 'percentage') {
      const value = signedNumber(record.percent);
      controls.push({
        startMs,
        endMs,
        kind: value === undefined || value < -100 ? 'unknown' : 'percent',
        ...(value === undefined ? {} : {value}),
      });
    } else {
      const value = parseInsulinNumber(record.rate);
      const validMode = record.temp == null || record.temp === 'absolute';
      controls.push({
        startMs,
        endMs,
        kind: value === undefined || !validMode ? 'unknown' : 'absolute',
        ...(value === undefined ? {} : {value}),
      });
    }
  }
  controls.sort((left, right) => left.startMs - right.startMs);
  const grouped: Control[] = [];
  for (const control of controls) {
    const previous = grouped[grouped.length - 1];
    if (!previous || previous.startMs !== control.startMs) {
      grouped.push({...control});
    } else if (
      previous.kind !== control.kind ||
      previous.value !== control.value ||
      previous.endMs !== control.endMs
    ) {
      previous.kind = 'unknown';
      previous.endMs = Math.max(previous.endMs, control.endMs);
      delete previous.value;
    }
  }
  // Later commands terminate earlier temps/suspends, including cancellation.
  grouped.forEach((control, index) => {
    control.endMs = Math.min(
      control.endMs,
      grouped[index + 1]?.startMs ?? period.endMs,
    );
  });
  return {controls: grouped, invalidAmounts};
};

/**
 * Hybrid estimate: completed recorded basal amounts replace the rate model on
 * their recorded spans. Schedule/temp/suspend rates fill remaining elapsed time.
 * This quantity remains an estimate; it never establishes actual pump delivery.
 */
export const buildEstimatedBasalUnits = (
  records: readonly Treatment[],
  period: Period,
  observedAtMs: number,
  profile: EstimatedBasalProfile,
): number | undefined => {
  const {startMs, endMs} = period;
  if (
    ![startMs, endMs, observedAtMs].every(Number.isFinite) ||
    endMs <= startMs ||
    endMs > observedAtMs ||
    !Number.isFinite(new Date(startMs).getTime()) ||
    !Number.isFinite(new Date(endMs).getTime())
  ) {
    return undefined;
  }
  if (profile?.history !== undefined) {
    const history = profile.history;
    if (
      !Array.isArray(history) ||
      !history.length ||
      !Number.isFinite(profile.verifiedThroughMs) ||
      profile.verifiedThroughMs! < endMs - 1 ||
      history.some(
        (entry, index) =>
          !entry ||
          typeof entry !== 'object' ||
          !Number.isFinite(entry.startMs) ||
          entry.startMs > profile.verifiedThroughMs! ||
          (index > 0 && entry.startMs <= history[index - 1]!.startMs) ||
          !parseSchedule(entry) ||
          !buildClock(entry.timeZone),
      ) ||
      history[0]!.startMs > startMs
    ) {
      return undefined;
    }
    let total = 0;
    for (let index = 0; index < history.length; index++) {
      const current = history[index]!;
      const left = Math.max(startMs, current.startMs);
      const right = Math.min(endMs, history[index + 1]?.startMs ?? endMs);
      if (right <= left) {
        continue;
      }
      const units = buildEstimatedBasalUnits(
        records,
        {startMs: left, endMs: right},
        observedAtMs,
        {
          entries: current.entries,
          ...(current.timeZone === undefined
            ? {}
            : {timeZone: current.timeZone}),
        },
      );
      if (units === undefined || !Number.isFinite(total + units)) {
        return undefined;
      }
      total += units;
    }
    return total;
  }
  const schedule = parseSchedule(profile);
  const clock = buildClock(profile?.timeZone);
  const model = buildControls(records, period, observedAtMs);
  if (!schedule || !clock || !model) {
    return undefined;
  }
  if (
    model.invalidAmounts.some(
      interval => interval.startMs < endMs && interval.endMs > startMs,
    )
  ) {
    return undefined;
  }
  const recorded = buildRecordedBasalSegments(
    getRecordedBasalIntervals(records, period, observedAtMs),
    period,
  );
  if (recorded.some(segment => segment.units === undefined)) {
    return undefined;
  }
  const boundaries = new Set<number>([startMs, endMs]);
  for (const interval of [...recorded, ...model.controls]) {
    if (interval.startMs > startMs && interval.startMs < endMs) {
      boundaries.add(interval.startMs);
    }
    if (interval.endMs > startMs && interval.endMs < endMs) {
      boundaries.add(interval.endMs);
    }
  }
  const points = [...boundaries].sort((left, right) => left - right);
  let total = 0;
  let recordedIndex = 0;
  let controlIndex = 0;
  try {
    for (let index = 0; index < points.length - 1; index++) {
      let cursor = points[index]!;
      const right = points[index + 1]!;
      while (
        recordedIndex < recorded.length &&
        recorded[recordedIndex]!.endMs <= cursor
      ) {
        recordedIndex++;
      }
      const actual = recorded[recordedIndex];
      if (actual && actual.startMs <= cursor && actual.endMs >= right) {
        total +=
          actual.units! * ((right - cursor) / (actual.endMs - actual.startMs));
        continue;
      }
      while (
        controlIndex < model.controls.length &&
        model.controls[controlIndex]!.endMs <= cursor
      ) {
        controlIndex++;
      }
      const candidate = model.controls[controlIndex];
      const control =
        candidate && candidate.startMs <= cursor && candidate.endMs > cursor
          ? candidate
          : undefined;
      if (control?.kind === 'unknown') {
        return undefined;
      }
      if (control?.kind === 'absolute') {
        total += control.value! * ((right - cursor) / HOUR_MS);
        continue;
      }
      while (cursor < right) {
        const local = clock(cursor);
        const entry =
          [...schedule].reverse().find(item => item.seconds <= local.seconds) ??
          schedule[schedule.length - 1]!;
        const nextProfileSeconds =
          schedule.find(item => item.seconds > local.seconds)?.seconds ??
          schedule[0]!.seconds + DAY_SECONDS;
        let next = Math.min(
          right,
          (Math.floor(cursor / MINUTE_MS) + 1) * MINUTE_MS,
          cursor + (nextProfileSeconds - local.seconds) * 1000,
        );
        // Split a DST/offset transition exactly, integrating elapsed time.
        if (clock(next - 1).offsetMs !== local.offsetMs) {
          let low = cursor;
          let high = next;
          while (high - low > 1) {
            const middle = Math.floor((low + high) / 2);
            if (clock(middle).offsetMs === local.offsetMs) {
              low = middle;
            } else {
              high = middle;
            }
          }
          next = high;
        }
        if (next <= cursor || !Number.isFinite(local.seconds)) {
          return undefined;
        }
        const multiplier =
          control?.kind === 'percent' ? (100 + control.value!) / 100 : 1;
        total += entry.rate * multiplier * ((next - cursor) / HOUR_MS);
        cursor = next;
      }
    }
  } catch {
    return undefined;
  }
  return Number.isFinite(total) && total >= 0 ? total : undefined;
};

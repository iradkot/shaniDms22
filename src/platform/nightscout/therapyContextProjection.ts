import type {
  TherapyModeChange,
  TherapyTreatmentFact,
} from '../../modules/trends';

type UnknownRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): number | undefined => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

const timestampMs = (value: unknown): number | undefined => {
  const numeric = finiteNumber(value);
  if (numeric !== undefined && numeric > 0) {
    const milliseconds = numeric < 100_000_000_000 ? numeric * 1_000 : numeric;
    return Number.isSafeInteger(Math.trunc(milliseconds))
      ? Math.trunc(milliseconds)
      : undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const recordTimestamp = (record: UnknownRecord): number | undefined =>
  timestampMs(record.date) ??
  timestampMs(record.mills) ??
  timestampMs(record.timestamp) ??
  timestampMs(record.created_at) ??
  timestampMs(record.createdAt) ??
  timestampMs(record.userCreatedDate);

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const recordText = (record: UnknownRecord): string =>
  [
    record.loopMode,
    record.mode,
    record.eventType,
    record.notes,
    record.profile,
    record.app,
    record.enteredBy,
  ]
    .map(text)
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('en-US');

/** Only explicit Open/Closed Loop labels are accepted as reliable state. */
export const classifyExplicitNightscoutAidMode = (
  record: UnknownRecord,
): TherapyModeChange['mode'] | undefined => {
  const rawMode = text(record.loopMode || record.mode)
    .toLocaleLowerCase('en-US')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (rawMode === 'closed loop' || rawMode === 'closed') {
    return 'closed-loop';
  }
  if (rawMode === 'open loop' || rawMode === 'open') {
    return 'open-loop';
  }
  const combined = recordText(record);
  if (
    /\bclosed[ _-]?loop\b/.test(combined) ||
    combined.includes('לולאה סגורה')
  ) {
    return 'closed-loop';
  }
  if (
    /\bopen[ _-]?loop\b/.test(combined) ||
    combined.includes('לולאה פתוחה')
  ) {
    return 'open-loop';
  }
  return undefined;
};

const insulinUnits = (record: UnknownRecord): number | undefined => {
  const direct = finiteNumber(record.insulin);
  if (direct !== undefined && direct >= 0) {
    return direct;
  }
  const combined = recordText(record);
  if (!/\b(insulin|bolus|correction)\b/.test(combined)) {
    return undefined;
  }
  const amount = finiteNumber(record.amount);
  return amount !== undefined && amount >= 0 ? amount : undefined;
};

export interface ProjectedNightscoutTherapyContext {
  readonly treatments: readonly TherapyTreatmentFact[];
  readonly modeChanges: readonly TherapyModeChange[];
}

export const projectNightscoutTherapyContext = (
  values: readonly unknown[],
): ProjectedNightscoutTherapyContext => {
  const treatments: TherapyTreatmentFact[] = [];
  const modeChanges: TherapyModeChange[] = [];
  values.forEach(value => {
    if (!isRecord(value)) {
      return;
    }
    const timestamp = recordTimestamp(value);
    if (timestamp === undefined) {
      return;
    }
    const insulin = insulinUnits(value);
    const carbs = finiteNumber(value.carbs);
    if (
      (insulin !== undefined && insulin >= 0) ||
      (carbs !== undefined && carbs >= 0)
    ) {
      treatments.push({
        timestampMs: timestamp,
        ...(insulin === undefined ? {} : {insulinUnits: insulin}),
        ...(carbs === undefined ? {} : {carbohydrateGrams: carbs}),
      });
    }
    const mode = classifyExplicitNightscoutAidMode(value);
    if (mode !== undefined) {
      modeChanges.push({timestampMs: timestamp, mode});
    }
  });
  return {treatments, modeChanges};
};


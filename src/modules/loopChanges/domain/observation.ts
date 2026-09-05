import {
  buildMatchedPeriodComparison,
  type TrendsGlucoseSample,
  type TrendsOverview,
  type TrendsPeriod,
  type TrendsRangeThresholds,
} from '../../trends';

const DAY_MS = 24 * 60 * 60 * 1000;

export type LoopChangeKind =
  | 'carb_ratio'
  | 'isf'
  | 'target'
  | 'basal'
  | 'dia'
  | 'other';

export type LoopChangeSourceKind =
  | 'loop-ios'
  | 'androidaps'
  | 'nightscout-profile'
  | 'other';

export type LoopSettingUnit =
  | 'g/U'
  | 'mg/dL/U'
  | 'mg/dL'
  | 'U/h'
  | 'hours'
  | 'percent'
  | 'other';

export type LoopSettingValue =
  | {
      readonly kind: 'scalar';
      readonly value: number;
      readonly unit: LoopSettingUnit;
      readonly customUnit?: string;
    }
  | {readonly kind: 'text'; readonly value: string}
  | {
      readonly kind: 'schedule';
      readonly unit: LoopSettingUnit;
      readonly customUnit?: string;
      readonly segments: readonly {
        readonly startMinutes: number;
        readonly value: number;
      }[];
    };

interface LoopSettingChangeBase {
  readonly id: string;
  readonly changedAtMs: number;
  readonly kind: LoopChangeKind;
  readonly summary: string;
}

export interface AuthoritativeLoopSettingChange
  extends LoopSettingChangeBase {
  readonly source: {
    readonly authority: 'authoritative';
    readonly kind: LoopChangeSourceKind;
    readonly label: string;
  };
  readonly previousValue?: LoopSettingValue;
  readonly nextValue?: LoopSettingValue;
}

export interface ObservedLoopSettingChange extends LoopSettingChangeBase {
  readonly source: {
    readonly authority: 'observed';
    readonly kind: LoopChangeSourceKind;
    readonly label: string;
  };
  readonly previousValue?: never;
  readonly nextValue?: never;
}

export type LoopSettingChange =
  | AuthoritativeLoopSettingChange
  | ObservedLoopSettingChange;

export interface PrepareLoopChangeHistoryInput {
  readonly period: TrendsPeriod;
  readonly changes: readonly LoopSettingChange[];
}

export interface PreparedLoopChangeHistory {
  readonly changes: readonly LoopSettingChange[];
  readonly duplicateCount: number;
}

export class LoopChangeInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoopChangeInputError';
  }
}

export const LOOP_CHANGE_KINDS: readonly LoopChangeKind[] = [
  'carb_ratio',
  'isf',
  'target',
  'basal',
  'dia',
  'other',
];
export const LOOP_CHANGE_SOURCE_KINDS: readonly LoopChangeSourceKind[] = [
  'loop-ios',
  'androidaps',
  'nightscout-profile',
  'other',
];
export const LOOP_SETTING_UNITS: readonly LoopSettingUnit[] = [
  'g/U',
  'mg/dL/U',
  'mg/dL',
  'U/h',
  'hours',
  'percent',
  'other',
];

const assertSettingValue = (value: LoopSettingValue): void => {
  if (
    value.kind !== 'text' &&
    !LOOP_SETTING_UNITS.includes(value.unit)
  ) {
    throw new LoopChangeInputError(
      'The setting value unit is not supported.',
    );
  }
  if (value.kind === 'scalar') {
    if (!Number.isFinite(value.value)) {
      throw new LoopChangeInputError('A scalar setting value must be finite.');
    }
    return;
  }
  if (value.kind === 'text') {
    if (value.value.trim().length === 0) {
      throw new LoopChangeInputError('A text setting value cannot be empty.');
    }
    return;
  }
  if (value.kind === 'schedule') {
    const starts = new Set<number>();
    value.segments.forEach(segment => {
      if (
        !Number.isInteger(segment.startMinutes) ||
        segment.startMinutes < 0 ||
        segment.startMinutes > 1439 ||
        starts.has(segment.startMinutes)
      ) {
        throw new LoopChangeInputError(
          'Schedule starts must be unique whole minutes from 0 through 1439.',
        );
      }
      if (!Number.isFinite(segment.value)) {
        throw new LoopChangeInputError(
          'Every schedule setting value must be finite.',
        );
      }
      starts.add(segment.startMinutes);
    });
    return;
  }
  throw new LoopChangeInputError('The setting value kind is not supported.');
};

export const assertValidLoopSettingChange = (
  item: LoopSettingChange,
): void => {
  if (item.id.trim().length === 0) {
    throw new LoopChangeInputError(
      'A Loop change requires a stable non-empty ID.',
    );
  }
  if (!Number.isFinite(item.changedAtMs)) {
    throw new LoopChangeInputError('A Loop change timestamp must be finite.');
  }
  if (!LOOP_CHANGE_KINDS.includes(item.kind)) {
    throw new LoopChangeInputError('The Loop change kind is not supported.');
  }
  if (
    !LOOP_CHANGE_SOURCE_KINDS.includes(item.source.kind) ||
    item.source.label.trim().length === 0
  ) {
    throw new LoopChangeInputError(
      'A Loop change requires a recognized, labelled source.',
    );
  }
  if (
    item.source.authority !== 'authoritative' &&
    item.source.authority !== 'observed'
  ) {
    throw new LoopChangeInputError(
      'Source authority must be authoritative or observed.',
    );
  }
  if (item.summary.trim().length === 0) {
    throw new LoopChangeInputError('A Loop change summary cannot be empty.');
  }
  if (
    item.source.authority !== 'authoritative' &&
    ('previousValue' in item || 'nextValue' in item)
  ) {
    throw new LoopChangeInputError(
      'Only authoritative source records may contain old or new values.',
    );
  }
  if (item.source.authority === 'authoritative') {
    if (item.previousValue !== undefined) {
      assertSettingValue(item.previousValue);
    }
    if (item.nextValue !== undefined) {
      assertSettingValue(item.nextValue);
    }
  }
};

export const prepareLoopChangeHistory = (
  input: PrepareLoopChangeHistoryInput,
): PreparedLoopChangeHistory => {
  if (
    !Number.isFinite(input.period.startMs) ||
    !Number.isFinite(input.period.endMs) ||
    input.period.endMs <= input.period.startMs
  ) {
    throw new LoopChangeInputError(
      'The Loop change history period must have finite ordered bounds.',
    );
  }
  const byId = new Map<string, LoopSettingChange>();
  let duplicateCount = 0;
  input.changes.forEach(item => {
    assertValidLoopSettingChange(item);
    if (
      item.changedAtMs < input.period.startMs ||
      item.changedAtMs >= input.period.endMs
    ) {
      return;
    }
    if (byId.has(item.id)) {
      duplicateCount += 1;
      return;
    }
    byId.set(item.id, item);
  });
  return {
    changes: Array.from(byId.values()).sort(
      (left, right) => right.changedAtMs - left.changedAtMs,
    ),
    duplicateCount,
  };
};

export interface BuildLoopChangeObservationInput {
  readonly change: LoopSettingChange;
  readonly windowDays: number;
  readonly samplesBefore: readonly TrendsGlucoseSample[];
  readonly samplesAfter: readonly TrendsGlucoseSample[];
  readonly thresholds: TrendsRangeThresholds;
  readonly expectedSampleIntervalMs: number;
}

export interface LoopChangeObservation {
  readonly calculationVersion: 'loop-change-observation-v1';
  readonly change: LoopSettingChange;
  readonly windowDays: number;
  readonly before: TrendsOverview;
  readonly after: TrendsOverview;
  readonly comparable: boolean;
  readonly observedDeltas:
    | {
        readonly meanGlucoseMgDl: number;
        readonly targetRangePercentagePoints: number;
        readonly coefficientOfVariationPercentagePoints: number;
      }
    | undefined;
}

export const buildLoopChangeObservation = (
  input: BuildLoopChangeObservationInput,
): LoopChangeObservation => {
  assertValidLoopSettingChange(input.change);
  if (!Number.isInteger(input.windowDays) || input.windowDays <= 0) {
    throw new LoopChangeInputError(
      'A comparison window must contain a positive whole number of days.',
    );
  }
  const windowMs = input.windowDays * DAY_MS;
  const beforePeriod = {
    startMs: input.change.changedAtMs - windowMs,
    endMs: input.change.changedAtMs,
  };
  const afterPeriod = {
    startMs: input.change.changedAtMs,
    endMs: input.change.changedAtMs + windowMs,
  };
  const comparison = buildMatchedPeriodComparison({
    current: {
      period: afterPeriod,
      expectedSampleIntervalMs: input.expectedSampleIntervalMs,
      samples: input.samplesAfter,
      thresholds: input.thresholds,
    },
    previous: {
      period: beforePeriod,
      expectedSampleIntervalMs: input.expectedSampleIntervalMs,
      samples: input.samplesBefore,
      thresholds: input.thresholds,
    },
  });
  const observedDeltas = comparison.deltas
    ? {
        meanGlucoseMgDl: comparison.deltas.meanGlucoseMgDl,
        targetRangePercentagePoints:
          comparison.deltas.targetRangePercentagePoints,
        coefficientOfVariationPercentagePoints:
          comparison.deltas.coefficientOfVariationPercentagePoints,
      }
    : undefined;

  return {
    calculationVersion: 'loop-change-observation-v1',
    change: input.change,
    windowDays: input.windowDays,
    before: comparison.previous,
    after: comparison.current,
    comparable: comparison.comparable,
    observedDeltas,
  };
};

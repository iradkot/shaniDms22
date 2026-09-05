import type {SettingsChangeEvent} from '../../../services/loopAnalysis/settingsChangeDetection';
import {detectSettingsChanges} from '../../../services/loopAnalysis/settingsChangeDetection';
import type {
  LoopChangeKind,
  LoopChangesDataSource,
  LoopSettingChange,
  LoopSettingUnit,
  LoopSettingValue,
} from '../../../modules/loopChanges';
import type {TrendsDataSource, TrendsPeriod} from '../../../modules/trends';
import {isE2E} from '../../../utils/e2e';

export interface NativeLoopChangesDataSourceDependencies {
  readonly glucoseDataSource: TrendsDataSource;
  /** Opaque adapter identity; the host recreates this adapter on source change. */
  readonly sourceRevision?: string;
  readonly loadDetectedChanges?: (input: {
    readonly beforeTimestamp: number;
    readonly minimumEvents: number;
  }) => Promise<readonly SettingsChangeEvent[]>;
  readonly useE2EFixtures?: boolean;
}

const kindFromLegacy = (
  value: SettingsChangeEvent['changes'][number]['type'],
): LoopChangeKind => {
  switch (value) {
    case 'carb_ratio':
      return 'carb_ratio';
    case 'isf':
      return 'isf';
    case 'target_low':
    case 'target_high':
      return 'target';
    case 'basal':
      return 'basal';
    case 'dia':
      return 'dia';
    case 'profile_switch':
      return 'other';
  }
};

const normalizedUnit = (
  rawUnit: string,
): {readonly unit: LoopSettingUnit; readonly customUnit?: string} => {
  switch (rawUnit.trim()) {
    case 'g/U':
    case 'mg/dL/U':
    case 'mg/dL':
    case 'hours':
      return {unit: rawUnit.trim() as LoopSettingUnit};
    case 'U/hr':
    case 'U/h':
      return {unit: 'U/h'};
    case '%':
    case 'percent':
      return {unit: 'percent'};
    case '':
      return {unit: 'other'};
    default:
      return {unit: 'other', customUnit: rawUnit.trim()};
  }
};

const settingValue = (
  rawValue: number | string | null,
  rawUnit: string,
): LoopSettingValue | undefined => {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    const unit = normalizedUnit(rawUnit);
    return {
      kind: 'scalar',
      value: rawValue,
      unit: unit.unit,
      ...(unit.customUnit === undefined ? {} : {customUnit: unit.customUnit}),
    };
  }
  if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
    return {kind: 'text', value: rawValue.trim()};
  }
  return undefined;
};

/** Drops raw profile payloads and projects only explicit before/after facts. */
export const projectDetectedLoopChanges = (
  events: readonly SettingsChangeEvent[],
  period: TrendsPeriod,
): readonly LoopSettingChange[] => {
  const projected: LoopSettingChange[] = [];
  events.forEach(event => {
    if (event.timestamp < period.startMs || event.timestamp >= period.endMs) {
      return;
    }
    event.changes.forEach((detail, index) => {
          const previousValue = settingValue(detail.oldValue, detail.unit);
          const nextValue = settingValue(detail.newValue, detail.unit);
          const slot = detail.timeSlot ? ` · ${detail.timeSlot}` : '';
          projected.push({
            id: `${event.id}:${index}`,
            changedAtMs: event.timestamp,
            kind: kindFromLegacy(detail.type),
            summary: `${detail.label}${slot}`,
            source: {
              authority: 'authoritative',
              kind: 'nightscout-profile',
              label: event.profileName.trim() || 'Nightscout profile',
            },
            ...(previousValue === undefined ? {} : {previousValue}),
            ...(nextValue === undefined ? {} : {nextValue}),
          });
        });
  });
  return projected;
};

const e2eChanges = (period: TrendsPeriod): readonly LoopSettingChange[] => {
  const changedAtMs = Math.max(
    period.startMs,
    period.endMs - 3 * 24 * 60 * 60 * 1000,
  );
  return changedAtMs >= period.endMs
    ? []
    : [
        {
          id: `e2e-loop-change-${changedAtMs}`,
          changedAtMs,
          kind: 'carb_ratio',
          summary: 'Breakfast carbohydrate ratio',
          source: {
            authority: 'authoritative',
            kind: 'nightscout-profile',
            label: 'E2E Nightscout profile',
          },
          previousValue: {kind: 'scalar', value: 10, unit: 'g/U'},
          nextValue: {kind: 'scalar', value: 9, unit: 'g/U'},
        },
      ];
};

export const createNativeLoopChangesDataSource = (
  dependencies: NativeLoopChangesDataSourceDependencies,
): LoopChangesDataSource => {
  const loadDetectedChanges =
    dependencies.loadDetectedChanges ??
    ((input: {readonly beforeTimestamp: number; readonly minimumEvents: number}) =>
      detectSettingsChanges({
        beforeTimestamp: input.beforeTimestamp,
        minEvents: input.minimumEvents,
        throwOnError: true,
      }));
  const useE2EFixtures = dependencies.useE2EFixtures ?? isE2E;
  return {
    loadGlucoseSamples: period =>
      dependencies.glucoseDataSource.loadGlucoseSamples(period),
    async loadChanges(period) {
      if (useE2EFixtures) {
        return e2eChanges(period);
      }
      const detected = await loadDetectedChanges({
        beforeTimestamp: period.endMs,
        minimumEvents: 250,
      });
      return projectDetectedLoopChanges(detected, period);
    },
  };
};

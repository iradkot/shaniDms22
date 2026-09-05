import {
  buildLoopChangeObservation,
  prepareLoopChangeHistory,
  type AuthoritativeLoopSettingChange,
  type LoopSettingChange,
} from 'app/modules/loopChanges';

const DAY_MS = 24 * 60 * 60 * 1000;

const change: AuthoritativeLoopSettingChange = {
  id: 'change-1',
  changedAtMs: 50 * DAY_MS,
  kind: 'carb_ratio',
  source: {
    authority: 'authoritative',
    kind: 'loop-ios',
    label: 'Loop profile history',
  },
  summary: 'Breakfast carbohydrate ratio updated',
  previousValue: {kind: 'scalar', value: 10, unit: 'g/U'},
  nextValue: {kind: 'scalar', value: 9, unit: 'g/U'},
};

describe('buildLoopChangeObservation', () => {
  it('uses equal non-overlapping periods anchored to the setting change', () => {
    const result = buildLoopChangeObservation({
      change,
      expectedSampleIntervalMs: DAY_MS,
      samplesBefore: [],
      samplesAfter: [],
      thresholds: {
        veryLowMaxMgDl: 54,
        targetMinMgDl: 70,
        targetMaxMgDl: 180,
        highMaxMgDl: 250,
      },
      windowDays: 14,
    });

    expect(result.calculationVersion).toBe('loop-change-observation-v1');
    expect(result.before.period).toEqual({
      startMs: 36 * DAY_MS,
      endMs: 50 * DAY_MS,
    });
    expect(result.after.period).toEqual({
      startMs: 50 * DAY_MS,
      endMs: 64 * DAY_MS,
    });
    expect(result.comparable).toBe(false);
    expect(result.observedDeltas).toBeUndefined();
  });

  it('exposes neutral observed deltas only when both windows pass the Trends gates', () => {
    const makeSamples = (startMs: number, values: readonly number[]) =>
      values.map((valueMgDl, index) => ({
        timestampMs: startMs + index * DAY_MS,
        valueMgDl,
      }));
    const input = {
      change,
      expectedSampleIntervalMs: DAY_MS,
      thresholds: {
        veryLowMaxMgDl: 54,
        targetMinMgDl: 70,
        targetMaxMgDl: 180,
        highMaxMgDl: 250,
      },
      windowDays: 14,
    } as const;
    const representative = buildLoopChangeObservation({
      ...input,
      samplesBefore: makeSamples(36 * DAY_MS, Array(14).fill(100)),
      samplesAfter: makeSamples(50 * DAY_MS, Array(14).fill(200)),
    });
    const partial = buildLoopChangeObservation({
      ...input,
      samplesBefore: makeSamples(36 * DAY_MS, Array(14).fill(100)),
      samplesAfter: makeSamples(50 * DAY_MS, Array(9).fill(200)),
    });

    expect(representative.comparable).toBe(true);
    expect(representative.observedDeltas).toEqual({
      meanGlucoseMgDl: 100,
      targetRangePercentagePoints: -100,
      coefficientOfVariationPercentagePoints: 0,
    });
    expect(partial.after.coveragePercent).toBe(64.29);
    expect(partial.comparable).toBe(false);
    expect(partial.observedDeltas).toBeUndefined();
  });

  it('withholds differences for complete seven-day windows because duration is not representative', () => {
    const samples = (startMs: number, valueMgDl: number) =>
      Array.from({length: 7}, (_, index) => ({
        timestampMs: startMs + index * DAY_MS,
        valueMgDl,
      }));
    const result = buildLoopChangeObservation({
      change,
      expectedSampleIntervalMs: DAY_MS,
      samplesBefore: samples(43 * DAY_MS, 100),
      samplesAfter: samples(50 * DAY_MS, 150),
      thresholds: {
        veryLowMaxMgDl: 54,
        targetMinMgDl: 70,
        targetMaxMgDl: 180,
        highMaxMgDl: 250,
      },
      windowDays: 7,
    });

    expect(result.before.coveragePercent).toBe(100);
    expect(result.after.coveragePercent).toBe(100);
    expect(result.before.durationQuality).toBe('short');
    expect(result.comparable).toBe(false);
    expect(result.observedDeltas).toBeUndefined();
  });
});

describe('prepareLoopChangeHistory', () => {
  it('keeps one stable record per exact source ID and sorts newest first', () => {
    const newer: LoopSettingChange = {
      id: 'change-2',
      changedAtMs: 60 * DAY_MS,
      kind: 'target',
      source: {
        authority: 'observed',
        kind: 'nightscout-profile',
        label: 'Nightscout profile event',
      },
      summary: 'Target profile changed',
    };

    expect(
      prepareLoopChangeHistory({
        changes: [change, newer, newer],
        period: {startMs: 40 * DAY_MS, endMs: 70 * DAY_MS},
      }),
    ).toEqual({changes: [newer, change], duplicateCount: 1});
  });

  it('rejects values claimed by a source that is not authoritative', () => {
    const unsafeRecord = {
      id: 'change-untrusted',
      changedAtMs: 55 * DAY_MS,
      kind: 'isf',
      source: {
        authority: 'observed',
        kind: 'other',
        label: 'Free-text note',
      },
      summary: 'Possible sensitivity change',
      previousValue: {kind: 'scalar', value: 45, unit: 'mg/dL/U'},
    } as unknown as LoopSettingChange;

    expect(() =>
      prepareLoopChangeHistory({
        changes: [unsafeRecord],
        period: {startMs: 40 * DAY_MS, endMs: 70 * DAY_MS},
      }),
    ).toThrow('Only authoritative source records may contain old or new values.');
  });

  it('rejects records without a usable stable source identity', () => {
    const missingIdentity = {...change, id: '   '};

    expect(() =>
      prepareLoopChangeHistory({
        changes: [missingIdentity],
        period: {startMs: 40 * DAY_MS, endMs: 70 * DAY_MS},
      }),
    ).toThrow('A Loop change requires a stable non-empty ID.');
  });

  it('rejects malformed authoritative schedule values', () => {
    const malformed = {
      ...change,
      nextValue: {
        kind: 'schedule',
        unit: 'U/h',
        segments: [
          {startMinutes: 0, value: 0.8},
          {startMinutes: 0, value: 0.9},
        ],
      },
    } as const;

    expect(() =>
      prepareLoopChangeHistory({
        changes: [malformed],
        period: {startMs: 40 * DAY_MS, endMs: 70 * DAY_MS},
      }),
    ).toThrow('Schedule starts must be unique whole minutes from 0 through 1439.');
  });

  it('rejects an unknown source-authority claim', () => {
    const unknownAuthority = {
      id: 'change-unknown-authority',
      changedAtMs: 55 * DAY_MS,
      kind: 'target',
      source: {
        authority: 'self-asserted',
        kind: 'other',
        label: 'Imported note',
      },
      summary: 'Target might have changed',
    } as unknown as LoopSettingChange;

    expect(() =>
      prepareLoopChangeHistory({
        changes: [unknownAuthority],
        period: {startMs: 40 * DAY_MS, endMs: 70 * DAY_MS},
      }),
    ).toThrow('Source authority must be authoritative or observed.');
  });

  it('rejects an unsupported unit in an authoritative value', () => {
    const unknownUnit = {
      ...change,
      nextValue: {kind: 'scalar', value: 9, unit: 'guessed-unit'},
    } as unknown as LoopSettingChange;

    expect(() =>
      prepareLoopChangeHistory({
        changes: [unknownUnit],
        period: {startMs: 40 * DAY_MS, endMs: 70 * DAY_MS},
      }),
    ).toThrow('The setting value unit is not supported.');
  });
});

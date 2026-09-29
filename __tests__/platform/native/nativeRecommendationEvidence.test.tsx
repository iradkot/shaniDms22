import {buildNativeRecommendationEvidence} from '../../../src/platform/native/ai/nativeRecommendationEvidence';
import type {NativeRecommendationToolResult} from '../../../src/platform/native/ai/nativeRecommendationEvidence';
import {buildCurrentDataSnapshot} from '../../../src/modules/currentData';

const now = Date.parse('2026-09-28T12:00:00Z');
const snapshot = (
  records: readonly unknown[],
  deviceRecords: readonly unknown[] = [],
  kind: 'fresh' | 'stale' = 'fresh',
) =>
  buildCurrentDataSnapshot({
    observedAtMs: now,
    glucose: {records, freshness: {kind: 'fresh', fetchedAtMs: now}},
    deviceStatus: {records: deviceRecords, freshness: {kind, fetchedAtMs: now}},
  });
const build = (
  overrides: Partial<
    Parameters<typeof buildNativeRecommendationEvidence>[0]
  > = {},
) =>
  buildNativeRecommendationEvidence({
    current: snapshot([{date: now - 5 * 60_000, sgv: 110, iobU: 9, cobG: 80}]),
    stats: {
      ok: true,
      result: {
        sampleCount: 288,
        stats: {avgBg: 115},
        tir: {inRangePercent: 90},
        events: {hypoEventCount: 1},
      },
    },
    insulin: {
      ok: true,
      result: {
        recordedInsulin: {
          quality: 'partial',
          bolusUnits: 0,
          basalEvidence: 'recorded',
          basalCoveragePercent: 0,
          basalCoveredMs: 0,
        },
        totals: {bolusU: 0, carbsG: 0},
        counts: {insulinEntries: 0},
        availability: {treatments: 'available'},
      },
    },
    startMs: now - 86_400_000,
    endMs: now,
    observedAtMs: now,
    days: 1,
    ...overrides,
  });

describe('native recommendation evidence', () => {
  it('preserves the actual glucose timestamp but does not treat merged device values as current', () => {
    const evidence = build();
    expect(evidence.currentSnapshot).toMatchObject({
      fresh: true,
      latest: {tMs: now - 5 * 60_000, mgdl: 110},
      ageMinutes: 5,
    });
    expect(evidence.currentSnapshot.latest).not.toHaveProperty('iobU');
    expect(evidence.currentSnapshot.latest).not.toHaveProperty('cobG');
    expect(evidence.currentDeviceStatus).toMatchObject({
      available: false,
      iobU: null,
      cobG: null,
      iob: {sourceTimestampMs: null},
      cob: {sourceTimestampMs: null},
    });
    expect(evidence.currentDeviceStatus.warning).toContain(
      'independent source observation timestamps',
    );
    expect(evidence.glucose).toMatchObject({estimatedCoveragePct: 100});
  });

  it('retains stale device availability without exposing stale IOB or COB numbers', () => {
    const evidence = build({
      current: snapshot(
        [{date: now, sgv: 105}],
        [
          {
            created_at: new Date(now).toISOString(),
            loop: {
              iob: {iob: 15, timestamp: new Date(now).toISOString()},
              cob: {cob: 100, timestamp: new Date(now).toISOString()},
            },
          },
        ],
        'stale',
      ),
    });
    expect(evidence.currentSnapshot.fresh).toBe(true);
    expect(evidence.currentDeviceStatus).toMatchObject({
      fresh: false,
      iob: {status: 'stale'},
      cob: {status: 'stale'},
      iobU: null,
      cobG: null,
    });
  });

  it('keeps an old glucose value timestamped and explicitly not current', () => {
    const timestamp = now - 60 * 60_000;
    const evidence = build({
      current: snapshot([{date: timestamp, sgv: 110}]),
    });
    expect(evidence.currentSnapshot).toMatchObject({
      fresh: false,
      latest: {tMs: timestamp, mgdl: 110},
      ageMinutes: 60,
    });
    expect(evidence.currentSnapshot.warning).toContain(
      'No valid current glucose reading',
    );
  });

  it('preserves fresh signed IOB while independently omitting stale COB', () => {
    const freshTime = now - 4 * 60_000;
    const oldTime = now - 243 * 60_000;
    const evidence = build({
      current: snapshot(
        [{date: freshTime, sgv: 110}],
        [
          {
            created_at: new Date(now).toISOString(),
            loop: {
              iob: {iob: -0.4, timestamp: new Date(freshTime).toISOString()},
              cob: {cob: 20, timestamp: new Date(oldTime).toISOString()},
            },
          },
        ],
      ),
    });
    expect(evidence.currentDeviceStatus).toMatchObject({
      available: true,
      fresh: false,
      iobU: -0.4,
      cobG: null,
      iob: {status: 'fresh', sourceTimestampMs: freshTime},
      cob: {status: 'stale', sourceTimestampMs: oldTime, value: null},
    });
  });

  it('ages the current snapshot again after historical loading without changing original timestamps', () => {
    const sourceTime = now - 14 * 60_000;
    const evidence = build({
      current: snapshot([{date: sourceTime, sgv: 110}]),
      observedAtMs: now + 3 * 60_000,
    });
    expect(evidence.currentSnapshot).toMatchObject({
      fresh: false,
      ageMinutes: 17,
      observation: {
        status: 'stale',
        fetchedAtMs: now,
        sourceTimestampMs: sourceTime,
      },
    });
  });

  it.each([
    {date: now + 1, sgv: 110},
    {date: now, sgv: Number.NaN},
    {date: now, sgv: 0},
    {date: now, sgv: -12},
    {date: Number.NaN, sgv: 110},
    {date: now},
  ])('does not mark invalid or future measurements as current: %p', sample => {
    const evidence = build({current: snapshot([sample])});
    expect(evidence.currentSnapshot).toMatchObject({
      fresh: false,
      latest: null,
    });
  });

  it('omits fabricated zero metrics when a successful stats call had zero samples', () => {
    const evidence = build({
      stats: {
        ok: true,
        result: {
          sampleCount: 0,
          stats: {avgBg: 0},
          tir: {inRangePercent: 0},
          events: {hypoEventCount: 0, hyperEventCount: 0},
        },
      },
    });
    expect(evidence.glucose).toMatchObject({available: false, sampleCount: 0});
    expect(evidence.glucose).not.toHaveProperty('stats');
    expect(evidence.glucose).not.toHaveProperty('tir');
    expect(evidence.glucose).not.toHaveProperty('events');
    expect(evidence.glucose.warning).toContain('unknown, not zero');
  });

  it('warns when sparse samples cannot support a monthly summary', () => {
    const evidence = build({
      days: 30,
      startMs: now - 30 * 86_400_000,
      stats: {ok: true, result: {sampleCount: 288, stats: {avgBg: 115}}},
    });
    expect(evidence.glucose).toMatchObject({
      available: true,
      sampleCount: 288,
      estimatedCoveragePct: 3.3,
    });
    expect(evidence.glucose.warning).toContain('incomplete observations');
  });

  it('preserves confirmed empty treatment totals but omits stale or failed totals', () => {
    expect(build().insulin).toMatchObject({
      available: true,
      totals: {bolusU: 0, carbsG: 0},
    });
    for (const insulin of [
      {ok: false, error: 'Unavailable'},
      {
        ok: true,
        result: {totals: {bolusU: 0}, availability: {treatments: 'stale'}},
      },
      {ok: true, result: {totals: {bolusU: 0}}},
    ] as NativeRecommendationToolResult[]) {
      const evidence = build({insulin});
      expect(evidence.insulin.available).toBe(false);
      expect(evidence.insulin).not.toHaveProperty('totals');
    }
  });
});

it('does not promote a fresh modeled total to recorded recommendation evidence', () => {
  const evidence = build({
    insulin: {
      ok: true,
      result: {
        availability: {treatments: 'available'},
        totals: {bolusU: 9, basalU: 24},
        recordedInsulin: {
          quality: 'available',
          basalUnits: 24,
          bolusUnits: 9,
          basalEstimated: true,
        },
      },
    },
  });
  expect(evidence.insulin.available).toBe(false);
  expect(evidence.insulin).not.toHaveProperty('totals');
});

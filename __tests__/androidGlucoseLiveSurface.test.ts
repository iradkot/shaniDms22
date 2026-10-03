import {configureExperimentalBuildForTests} from './mocks/experimentalBuild';
configureExperimentalBuildForTests();

import {
  buildAndroidGlucoseWidgetUpdateArgs,
  calculateWidgetTir,
  updateAndroidGlucoseLiveSurface,
  deleteAndroidGlucoseAccountData,
} from 'app/services/androidGlucoseLiveSurface';
import {BgSample} from 'app/types/day_bgs.types';
import {buildCurrentDataSnapshot} from 'app/modules/currentData';
import {NativeModules} from 'react-native';
import {
  configureNightscoutInstance,
  getNightscoutConfigurationRevision,
} from 'app/api/shaniNightscoutInstances';

jest.mock('react-native', () => ({
  NativeModules: {GlucoseLiveModule: {updateLiveSurface: jest.fn(), deleteAccountData: jest.fn(async () => {})}},
  Platform: {OS: 'android'},
}));

const bg = (sgv: number, date = 1, extra: Partial<BgSample> = {}) =>
  ({sgv, date, ...extra} as BgSample);

describe('androidGlucoseLiveSurface widget payload', () => {
  it('keeps measured glucose, insulin and TIR but strips forecast projections in the pilot', () => {
    globalThis.__SHANI_RELEASE_CHANNEL__ = 'pilot';
    const args = buildAndroidGlucoseWidgetUpdateArgs({
      currentData: buildCurrentDataSnapshot({
        observedAtMs: 12345,
        glucose: {records: [bg(101, 12345)], freshness: {kind: 'fresh', fetchedAtMs: 12345}},
        deviceStatus: {
          records: [{loop: {
            iob: {iob: 0.5, timestamp: 12300},
            cob: {cob: 4, timestamp: 12200},
          }}],
          freshness: {kind: 'fresh', fetchedAtMs: 12345},
        },
      }),
      enrichedBg: bg(101, 12345, {iob: 0.5, cob: 4}),
      predictions: [{sgv: 110}, {sgv: 120}, {sgv: 130}],
      recentBgSamples: [bg(80), bg(100)],
    }, {low: 70, high: 180}, 12345);
    expect(args?.slice(0, 5)).toEqual([101, '•', 12345, 0.5, 4]);
    expect(args?.[9]).toBe(100);
    expect(args?.slice(10, 13)).toEqual([-1, -1, -1]);
    expect(args?.slice(15, 17)).toEqual([12300, 12200]);
  });
  it('calculates TIR with inclusive range boundaries and ignores invalid samples', () => {
    const samples = [
      bg(69),
      bg(70),
      bg(100),
      bg(180),
      bg(181),
      {sgv: Number.NaN, date: 6} as BgSample,
    ];

    expect(calculateWidgetTir(samples, {low: 70, high: 180})).toBe(60);
  });

  it('builds the native widget payload with insulin stats, TIR, projections, and thresholds', () => {
    const args = buildAndroidGlucoseWidgetUpdateArgs(
      {
        currentData: buildCurrentDataSnapshot({
          observedAtMs: 12345,
          glucose: null,
          deviceStatus: {
            records: [
              {
                loop: {
                  iob: {iob: -0.2, timestamp: 12300},
                  cob: {cob: 12.4, timestamp: 12200},
                },
              },
            ],
            freshness: {kind: 'fresh', fetchedAtMs: 12345},
          },
        }),
        enrichedBg: bg(101.6, 12345, {
          direction: 'FortyFiveUp',
          iob: -0.2,
          cob: 12.4,
        }),
        predictions: [{sgv: 110.2}, {sgv: 120.8}, {sgv: 130.1}],
        recentBgSamples: [bg(80), bg(190), bg(100), bg(70)],
        insulinStats: {
          totalBasal: 8.25,
          totalBolus: 5.5,
          basalBolusRatio: 0.6,
          totalInsulin: 13.75,
        },
      },
      {low: 70, high: 180},
      12345,
    );

    expect(args).toEqual([
      102,
      '↗',
      12345,
      -0.2,
      12.4,
      8.25,
      5.5,
      0.6,
      13.75,
      75,
      110,
      121,
      130,
      70,
      180,
      12300,
      12200,
      '',
      -1,
    ]);
  });

  it('uses sentinel values for missing optional data without dropping the glucose update', () => {
    const args = buildAndroidGlucoseWidgetUpdateArgs({
      enrichedBg: bg(99, 12345),
      insulinStats: null,
    });

    expect(args).toEqual([
      99,
      '•',
      12345,
      -999,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      '',
      -1,
    ]);
  });

  it('never replaces a missing observation timestamp with the current time', () => {
    expect(
      buildAndroidGlucoseWidgetUpdateArgs({
        enrichedBg: {sgv: 100, date: undefined} as unknown as BgSample,
      }),
    ).toBeUndefined();
    expect(
      buildAndroidGlucoseWidgetUpdateArgs(
        {enrichedBg: bg(100, 200)},
        undefined,
        199,
      ),
    ).toBeUndefined();
  });

  it('drops expired field loads while keeping the original glucose clock', () => {
    const nowMs = 1_800_000_000_000;
    const currentData = buildCurrentDataSnapshot({
      observedAtMs: nowMs - 60_000,
      glucose: null,
      deviceStatus: {
        records: [
          {
            loop: {
              iob: {iob: -1, timestamp: nowMs - 15 * 60_000},
              cob: {cob: 0, timestamp: nowMs - 60_000},
            },
          },
        ],
        freshness: {kind: 'fresh', fetchedAtMs: nowMs - 60_000},
      },
    });
    const args = buildAndroidGlucoseWidgetUpdateArgs(
      {currentData, enrichedBg: bg(100, nowMs - 60_000, {iob: -1, cob: 0})},
      undefined,
      nowMs,
    )!;
    expect(args[2]).toBe(nowMs - 60_000);
    expect(args.slice(3, 5)).toEqual([-999, 0]);
    expect(args.slice(15, 17)).toEqual([-1, nowMs - 60_000]);
  });

  it('rejects an old snapshot after a source changes away and back', () => {
    const nativeUpdate = NativeModules.GlucoseLiveModule
      .updateLiveSurface as jest.Mock;
    nativeUpdate.mockClear();
    configureNightscoutInstance({
      baseUrl: 'https://source-a.example',
      ownerUserId: 'fixture',
    });
    const configurationRevision = getNightscoutConfigurationRevision();
    const snapshot = {
      enrichedBg: bg(100, Date.now()),
      sourceBaseUrl: 'https://source-a.example',
      configurationRevision,
    };
    configureNightscoutInstance({
      baseUrl: 'https://source-b.example',
      ownerUserId: 'fixture',
    });
    configureNightscoutInstance({
      baseUrl: 'https://source-a.example',
      ownerUserId: 'fixture',
    });
    updateAndroidGlucoseLiveSurface(snapshot);
    expect(nativeUpdate).not.toHaveBeenCalled();
    updateAndroidGlucoseLiveSurface({
      ...snapshot,
      configurationRevision: getNightscoutConfigurationRevision(),
    });
    expect(nativeUpdate).toHaveBeenCalledTimes(1);
    expect(nativeUpdate.mock.calls[0]?.slice(17)).toEqual([
      'https://source-a.example',
      getNightscoutConfigurationRevision(),
    ]);
  });

  it('awaits native deletion failures and never appends another account source to the deletion manifest', async () => {
    const cleanup = NativeModules.GlucoseLiveModule.deleteAccountData as jest.Mock;
    configureNightscoutInstance({baseUrl: 'https://source-b.example', ownerUserId: 'owner-B'});
    cleanup.mockRejectedValueOnce(new Error('native teardown failed'));
    await expect(deleteAndroidGlucoseAccountData('owner-A', ['a'.repeat(40)])).rejects.toThrow('native teardown failed');
    expect(cleanup).toHaveBeenLastCalledWith('owner-A', ['a'.repeat(40)]);
    await deleteAndroidGlucoseAccountData('owner-A', ['a'.repeat(40)]);
  });
});

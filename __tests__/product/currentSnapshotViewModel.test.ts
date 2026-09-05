import {
  coreDestinationRegistry,
  type DestinationRuntimeContext,
} from '../../src/product/destinations';
import {selectCurrentSnapshotTarget} from '../../src/product/hub';
import {createCurrentSnapshotViewModel} from '../../src/platform/native/product';
import type {LatestNightscoutSnapshotState} from '../../src/platform/native/product';

const NOW_MS = 2_000_000;
const runtime: DestinationRuntimeContext = {platform: 'android'};
const target = selectCurrentSnapshotTarget(coreDestinationRegistry, {runtime});

const state = (
  snapshot: unknown,
  options: {readonly isLoading?: boolean; readonly error?: unknown} = {},
): LatestNightscoutSnapshotState => ({
  snapshot,
  isLoading: options.isLoading ?? false,
  error: options.error ?? null,
});

const build = (
  snapshotState: LatestNightscoutSnapshotState,
  locale: 'en' | 'he' = 'he',
) =>
  createCurrentSnapshotViewModel({
    locale,
    nowMs: NOW_MS,
    state: snapshotState,
    target,
  });

describe('createCurrentSnapshotViewModel', () => {
  it('shows loading only while there is no usable reading', () => {
    expect(build(state(null, {isLoading: true}))).toEqual({
      status: 'loading',
      target,
    });
  });

  it('shows an empty state when Nightscout returned no reading', () => {
    expect(build(state(null))).toEqual({
      status: 'empty',
      target,
      message: 'אין עדיין נתון סוכר זמין.',
    });
  });

  it('shows an offline state without exposing the transport error', () => {
    expect(
      build(state(null, {error: new Error('secret transport detail')})),
    ).toEqual({
      status: 'offline',
      target,
      message: 'אין חיבור ל־Nightscout כרגע.',
    });
  });

  it('formats a fresh reading, trend, age, IOB and COB', () => {
    const result = build(
      state({
        staleLevel: 'fresh',
        enrichedBg: {
          sgv: 116.6,
          date: NOW_MS - 4 * 60_000,
          direction: 'DoubleUp',
          iob: 1.234,
          cob: 12,
        },
      }),
    );

    expect(result).toMatchObject({
      status: 'ready',
      glucoseLabel: '117 mg/dL',
      trendLabel: '↑↑',
      dataAgeLabel: 'לפני 4 דק׳',
      iobLabel: 'IOB 1.23 U',
      cobLabel: 'COB 12 g',
    });
    expect(result.message).toBeUndefined();
  });

  it('marks a reading stale from either Nightscout state or its actual age', () => {
    const staleFromState = build(
      state({
        staleLevel: 'very-stale',
        enrichedBg: {sgv: 90, date: NOW_MS - 2 * 60_000},
      }),
    );
    const staleFromAge = build(
      state({
        staleLevel: 'fresh',
        enrichedBg: {sgv: 90, date: NOW_MS - 11 * 60_000},
      }),
    );

    expect(staleFromState.status).toBe('stale');
    expect(staleFromAge.status).toBe('stale');
    expect(staleFromAge.message).toBe('הנתון האחרון אינו עדכני.');
  });

  it('keeps the last valid reading visible while offline', () => {
    const result = build(
      state(
        {
          staleLevel: 'fresh',
          enrichedBg: {
            sgv: 101,
            date: NOW_MS - 60_000,
            direction: 'Flat',
          },
        },
        {error: 'offline'},
      ),
    );

    expect(result).toMatchObject({
      status: 'offline',
      glucoseLabel: '101 mg/dL',
      trendLabel: '→',
      message: 'אין חיבור כרגע. מוצג הנתון האחרון.',
    });
  });

  it('rejects malformed readings and ignores unknown trend values', () => {
    expect(build(state({enrichedBg: {sgv: '110', date: NOW_MS}})).status).toBe(
      'empty',
    );

    const validReading = build(
      state({
        enrichedBg: {
          sgv: 110,
          date: NOW_MS,
          direction: 'unexpected-direction',
        },
      }),
    );
    expect(validReading.status).toBe('ready');
    expect(validReading.trendLabel).toBeUndefined();
  });
});

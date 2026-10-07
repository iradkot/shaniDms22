import {
  buildEstimatedBasalProfileHistoryFromSchedules,
  decodeEstimatedBasalProfile,
  decodeEstimatedBasalProfileHistory,
} from 'app/services/insulin/estimatedBasalProfile';
import {buildEstimatedBasalUnits} from 'app/services/insulin/estimatedBasal';

const asOfMs = Date.parse('2026-10-04T09:00:00Z');
const row = {
  startDate: '2026-10-01T00:00:00Z',
  defaultProfile: 'Default',
  store: {
    Default: {
      timezone: 'Asia/Jerusalem',
      basal: [{time: '00:00', timeAsSeconds: '0', value: '0.8'}],
    },
  },
};
describe('effective basal profile decoding', () => {
  it('retains the selected schedule and timezone', () => {
    expect(decodeEstimatedBasalProfile([row], asOfMs)).toEqual({
      timeZone: 'Asia/Jerusalem',
      entries: [{time: '00:00', timeAsSeconds: 0, value: 0.8}],
    });
  });
  it.each([
    {...row, startDate: '2026-10-05T00:00:00Z'},
    {...row, startDate: 'invalid'},
    {...row, defaultProfile: 'missing'},
    {...row, store: {Default: {basal: [{time: '00:00', value: null}]}}},
  ])('declines missing or invalid effective schedules', value => {
    expect(decodeEstimatedBasalProfile([value], asOfMs)).toBeUndefined();
  });

  it('retains verified schedules at their effective instants and deduplicates identical uploads', () => {
    const later = {...row, startDate: '2026-10-04T08:00:00Z'};
    const result = decodeEstimatedBasalProfileHistory(
      [later, row, later],
      asOfMs - 2 * 3_600_000,
      asOfMs,
    );
    expect(result?.history?.map(item => item.startMs)).toEqual([
      Date.parse(row.startDate),
      Date.parse(later.startDate),
    ]);
    expect(result?.verifiedThroughMs).toBe(asOfMs);
  });

  it.each(
    [
      [],
      [null, row],
      [{...row, startDate: '2026-10-04T10:00:00Z'}],
      [{...row, startDate: '2026-10-04T08:00:00Z'}],
      [row, {...row, store: {Default: {basal: [{time: '00:00', value: 2}]}}}],
    ].map(rows => ({rows})),
  )(
    'declines malformed, future, missing-carry-in or conflicting history %j',
    ({rows}) => {
      expect(
        decodeEstimatedBasalProfileHistory(
          rows,
          asOfMs - 2 * 3_600_000,
          asOfMs,
        ),
      ).toBeUndefined();
    },
  );
});

describe('normalized effective basal history', () => {
  const startMs = Date.parse('2026-10-04T07:00:00Z');
  const normalized = {
    effectiveFromMs: Date.parse(row.startDate),
    timeZone: 'Asia/Jerusalem',
    entries: [{secondsFromMidnight: 0, rateUnitsPerHour: 0.8}],
  };

  it('uses the same carry-in and effective update selection as raw history', () => {
    const updateMs = startMs + 3_600_000;
    const updatedRaw = {
      ...row,
      startDate: new Date(updateMs).toISOString(),
      store: {
        Default: {
          timezone: normalized.timeZone,
          basal: [{time: '00:00', value: 1.5}],
        },
      },
    };
    const update = {
      ...normalized,
      effectiveFromMs: updateMs,
      entries: [{secondsFromMidnight: 0, rateUnitsPerHour: 1.5}],
    };
    const raw = decodeEstimatedBasalProfileHistory(
      [updatedRaw, row, updatedRaw],
      startMs,
      asOfMs,
    );
    const result = buildEstimatedBasalProfileHistoryFromSchedules(
      [update, normalized, update],
      startMs,
      asOfMs,
    );
    expect(result?.history?.map(profile => profile.startMs)).toEqual([
      normalized.effectiveFromMs,
      updateMs,
    ]);
    expect(result?.verifiedThroughMs).toBe(asOfMs);
    expect(
      buildEstimatedBasalUnits([], {startMs, endMs: asOfMs}, asOfMs, result!),
    ).toBeCloseTo(2.3);
    expect(
      buildEstimatedBasalUnits([], {startMs, endMs: asOfMs}, asOfMs, raw!),
    ).toBeCloseTo(2.3);
  });

  it('preserves schedule changes with seconds precision', () => {
    const result = buildEstimatedBasalProfileHistoryFromSchedules(
      [
        {
          ...normalized,
          entries: [
            ...normalized.entries,
            {
              secondsFromMidnight: 12 * 3600 + 34 * 60 + 56,
              rateUnitsPerHour: 1,
            },
          ],
        },
      ],
      startMs,
      asOfMs,
    );
    expect(result?.entries[1]).toEqual({
      time: '12:34:56',
      timeAsSeconds: 45296,
      value: 1,
    });
  });

  it.each(
    [
      [],
      [{...normalized, effectiveFromMs: undefined}],
      [{...normalized, effectiveFromMs: asOfMs + 1}],
      [{...normalized, effectiveFromMs: startMs + 1}],
      [
        normalized,
        {
          ...normalized,
          entries: [{secondsFromMidnight: 0, rateUnitsPerHour: 2}],
        },
      ],
      [
        {
          ...normalized,
          entries: [{secondsFromMidnight: -1, rateUnitsPerHour: 1}],
        },
      ],
      [
        {
          ...normalized,
          entries: [{secondsFromMidnight: 0, rateUnitsPerHour: Number.NaN}],
        },
      ],
    ].map(schedules => ({schedules})),
  )(
    'declines missing, invalid, future or conflicting normalized evidence %j',
    ({schedules}) => {
      expect(
        buildEstimatedBasalProfileHistoryFromSchedules(
          schedules,
          startMs,
          asOfMs,
        ),
      ).toBeUndefined();
    },
  );
});

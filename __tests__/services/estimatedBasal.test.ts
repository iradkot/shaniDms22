import {
  buildEstimatedBasalUnits,
  type EstimatedBasalProfile,
} from 'app/services/insulin/estimatedBasal';
import {
  buildRecordedBasalSegments,
  buildRecordedInsulinSummary,
  getRecordedBasalIntervals,
} from 'app/services/insulin/recordedInsulin';
import fixtures from '../fixtures/estimated-basal.json';

interface EstimatedBasalFixture {
  readonly name: string;
  readonly start?: string;
  readonly end?: string;
  readonly observedAt?: string;
  readonly profile?: EstimatedBasalProfile;
  readonly records: readonly Record<string, unknown>[];
  readonly expectedBasalUnits: number | null;
  readonly expectedRecordedBasalUnits?: number;
}

describe('shared TypeScript and native estimated basal fixtures', () => {
  it.each(fixtures.cases as readonly EstimatedBasalFixture[])('$name', fixture => {
    const period = {
      startMs: Date.parse(fixture.start ?? fixtures.start),
      endMs: Date.parse(fixture.end ?? fixtures.end),
    };
    const observedAtMs = Date.parse(fixture.observedAt ?? fixtures.observedAt);
    const records = [...fixtures.records, ...fixture.records];
    const recorded = buildRecordedInsulinSummary(records, period, observedAtMs);
    const basal = buildEstimatedBasalUnits(
      records,
      period,
      observedAtMs,
      fixture.profile ?? fixtures.profile,
    );
    expect(recorded.bolusUnits).toBe(2);
    if (fixture.expectedBasalUnits === null) {
      expect(basal).toBeUndefined();
    } else {
      expect(basal).toBeCloseTo(fixture.expectedBasalUnits, 8);
      expect(basal! + recorded.bolusUnits!).toBeCloseTo(
        fixture.expectedBasalUnits + 2,
        8,
      );
    }
    if (fixture.expectedRecordedBasalUnits !== undefined) {
      expect(recorded.basalUnits).toBeCloseTo(
        fixture.expectedRecordedBasalUnits,
        8,
      );
    }
  });
});

const startMs = Date.parse('2026-09-27T00:00:00Z');
const hour = 3_600_000;
const profile: EstimatedBasalProfile = {
  entries: [{time: '00:00', timeAsSeconds: 0, value: 1}],
  timeZone: 'UTC',
};
const iso = (hours: number) => new Date(startMs + hours * hour).toISOString();
const temp = (hours: number, duration = 60, rate = 2) => ({
  eventType: 'Temp Basal',
  created_at: iso(hours),
  duration,
  absolute: rate,
});
const estimate = (
  records: readonly Record<string, unknown>[],
  hours = 3,
  schedule = profile,
) =>
  buildEstimatedBasalUnits(
    records,
    {startMs, endMs: startMs + hours * hour},
    startMs + hours * hour,
    schedule,
  );

describe('hybrid estimated basal', () => {
  it('includes temp delivery in total comparisons and uses actual amounts ahead of programmed rates', () => {
    const records = [
      {...temp(1), enteredBy: 'loop://phone', amount: 1.8},
      {eventType: 'Correction Bolus', created_at: iso(1.5), insulin: 2},
    ];
    const period = {startMs, endMs: startMs + 3 * hour};
    const current = buildRecordedInsulinSummary(records, period, period.endMs);
    const previous = buildRecordedInsulinSummary(
      [records[1]!],
      period,
      period.endMs,
    );
    expect(estimate(records)).toBeCloseTo(3.8, 10);
    expect(estimate(records)! + current.bolusUnits!).toBeCloseTo(5.8, 10);
    expect(estimate([])! + previous.bolusUnits!).toBeCloseTo(5, 10);
    expect(current.basalUnits).toBe(1.8);
    expect(current.basalCoveragePercent).toBeCloseTo(100 / 3, 10);
  });

  it('uses an absolute temp as a replacement for the baseline', () => {
    expect(estimate([temp(1)])).toBeCloseTo(4, 10);
  });

  it('counts the explicit deliveredUnits rather than a contradictory Loop amount', () => {
    expect(
      estimate([
        {...temp(1), enteredBy: 'loop://phone', amount: 5, deliveredUnits: 1.7},
      ]),
    ).toBeCloseTo(3.7, 10);
  });

  it('prorates a completed actual interval across the requested cutoff', () => {
    const period = {startMs, endMs: startMs + 1.5 * hour};
    expect(
      buildEstimatedBasalUnits(
        [{...temp(1), enteredBy: 'loop://phone', amount: 1.8}],
        period,
        startMs + 3 * hour,
        profile,
      ),
    ).toBeCloseTo(1.9, 10);
  });

  it.each([{isMutable: true}, {mutable: true}, {}])(
    'uses elapsed rate only for ongoing or mutable doses %j',
    mutable => {
      expect(
        estimate(
          [{...temp(0), amount: 100, enteredBy: 'loop://phone', ...mutable}],
          0.5,
        ),
      ).toBeCloseTo(1, 10);
    },
  );

  it('uses a rate model for a mutable historical dose, even when its declared end has passed', () => {
    expect(
      estimate([{...temp(1), deliveredUnits: 100, isMutable: true}]),
    ).toBeCloseTo(4, 10);
  });

  it('handles temp replacement and resumes the schedule after the replacement expires', () => {
    expect(estimate([temp(0, 180), temp(1, 30, 0.5)], 2)).toBeCloseTo(2.75, 10);
  });

  it('handles cancellation and a cancellation before the requested day', () => {
    expect(estimate([temp(0, 180), temp(1, 0, 0)], 2)).toBeCloseTo(3, 10);
    expect(estimate([temp(-1, 180), temp(-0.5, 0, 0)], 2)).toBeCloseTo(2, 10);
  });

  it('does not revive an older temp after a later temp has expired before the range', () => {
    expect(estimate([temp(-2, 300, 2), temp(-1, 30, 0.5)], 1)).toBeCloseTo(
      1,
      10,
    );
  });

  it('carries a temp across midnight for only its remaining time', () => {
    expect(estimate([temp(-0.5, 60, 2)], 1)).toBeCloseTo(1.5, 10);
  });

  it('carries an open suspension until resume and restores the schedule', () => {
    expect(
      estimate([
        {eventType: 'Suspend Pump', created_at: iso(-1)},
        {eventType: 'Resume Pump', created_at: iso(1)},
      ]),
    ).toBeCloseTo(2, 10);
  });

  it.each([
    ['Pump Suspend', 'Pump Resume'],
    ['pump suspend', 'PUMP RESUME'],
    ['PumpSuspend', 'PumpResume'],
    ['SuspendPump', 'ResumePump'],
  ])('supports suspension/resume aliases %s and %s', (suspend, resume) => {
    expect(
      estimate([
        {eventType: suspend, created_at: iso(-1)},
        {eventType: resume, created_at: iso(1)},
      ]),
    ).toBeCloseTo(2, 10);
  });

  it.each([
    {eventType: 'Pump Suspend', duration: -1},
    {eventType: 'Suspend Pump', endDate: 'unknown'},
    {eventType: 'SuspendPump', duration: 'unknown'},
  ])('rejects an explicit malformed suspension lifetime %j', fields => {
    expect(estimate([{created_at: iso(0), ...fields}])).toBeUndefined();
  });

  it('lets a later temp replace a suspension and honors an explicit suspension duration', () => {
    expect(
      estimate([{eventType: 'Suspend Pump', created_at: iso(-1)}, temp(1)]),
    ).toBeCloseTo(3, 10);
    expect(
      estimate([{eventType: 'Suspend Pump', created_at: iso(1), duration: 30}]),
    ).toBeCloseTo(2.5, 10);
  });

  it('treats resume as termination of a temp', () => {
    expect(
      estimate([temp(0, 180), {eventType: 'Resume Pump', created_at: iso(1)}]),
    ).toBeCloseTo(4, 10);
  });

  it('supports zero basal schedules, zero absolute temps and a percentage suspension', () => {
    expect(
      estimate([], 3, {...profile, entries: [{time: '00:00', value: 0}]}),
    ).toBe(0);
    expect(estimate([temp(1, 60, 0)])).toBeCloseTo(2, 10);
    expect(
      estimate([
        {...temp(1), absolute: undefined, temp: 'percentage', percent: -100},
      ]),
    ).toBeCloseTo(2, 10);
  });

  it('applies Nightscout percentage deltas to each scheduled rate, with absolute precedence', () => {
    const schedule = {
      ...profile,
      entries: [
        {time: '00:00', value: 1},
        {time: '01:00', value: 2},
      ],
    };
    expect(
      estimate(
        [
          {
            ...temp(0, 120),
            absolute: undefined,
            temp: 'percentage',
            percent: 50,
          },
        ],
        2,
        schedule,
      ),
    ).toBeCloseTo(4.5, 10);
    expect(
      estimate([{...temp(0, 60, 2), temp: 'percentage', percent: -100}], 1),
    ).toBeCloseTo(2, 10);
  });

  it('preserves second and millisecond profile/event/range boundaries', () => {
    const schedule = {
      ...profile,
      entries: [
        {time: '00:00', value: 1},
        {time: '00:00:30', timeAsSeconds: 30, value: 2},
      ],
    };
    expect(estimate([], 1 / 60, schedule)).toBeCloseTo(1.5 / 60, 10);
    expect(
      buildEstimatedBasalUnits(
        [
          {
            ...temp(0),
            created_at: new Date(startMs + 500).toISOString(),
            duration: 0.5,
          },
        ],
        {startMs: startMs + 250, endMs: startMs + 60_250},
        startMs + hour,
        profile,
      ),
    ).toBeCloseTo(1.5 / 60, 10);
  });

  it('uses the profile timezone rather than the device timezone', () => {
    const schedule = {
      timeZone: 'Asia/Jerusalem',
      entries: [
        {time: '00:00', value: 1},
        {time: '03:00', value: 2},
      ],
    };
    expect(estimate([], 1, schedule)).toBeCloseTo(2, 10);
  });

  it.each(['GMT+3', 'UTC+03:00', '+03:00', 'ETC/GMT-3'])(
    'supports Loop fixed timezone %s',
    timeZone => {
      const schedule = {
        timeZone,
        entries: [
          {time: '00:00', value: 1},
          {time: '03:00', value: 2},
        ],
      };
      expect(estimate([], 1, schedule)).toBeCloseTo(2, 10);
    },
  );

  it.each([
    ['GMT+5:30', '05:45'],
    ['+05:30', '05:45'],
    ['GMT-3:30', '20:45'],
    ['-03:30', '20:45'],
    ['UTC+5:45', '06:00'],
  ])('supports sub-hour fixed timezone %s', (timeZone, boundary) => {
    const schedule = {
      timeZone,
      entries: [
        {time: '00:00', value: 1},
        {time: boundary, value: 2},
      ],
    };
    expect(estimate([], 0.5, schedule)).toBeCloseTo(0.75, 10);
  });

  it.each([
    ['2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z', 23],
    ['2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z', 25],
  ])('integrates real elapsed hours across DST %s', (start, end, expected) => {
    const period = {startMs: Date.parse(start), endMs: Date.parse(end)};
    expect(
      buildEstimatedBasalUnits([], period, period.endMs, {
        ...profile,
        timeZone: 'America/New_York',
      }),
    ).toBeCloseTo(expected, 8);
  });

  it('repeats the relevant schedule during a repeated hour and skips a nonexistent hour', () => {
    const schedule = {
      timeZone: 'America/New_York',
      entries: [
        {time: '00:00', value: 1},
        {time: '01:30', value: 2},
        {time: '02:30', value: 3},
      ],
    };
    const fall = {
      startMs: Date.parse('2026-11-01T05:00:00Z'),
      endMs: Date.parse('2026-11-01T08:00:00Z'),
    };
    expect(
      buildEstimatedBasalUnits([], fall, fall.endMs, schedule),
    ).toBeCloseTo(5.5, 8);
    const spring = {
      startMs: Date.parse('2026-03-08T06:00:00Z'),
      endMs: Date.parse('2026-03-08T08:00:00Z'),
    };
    expect(
      buildEstimatedBasalUnits([], spring, spring.endMs, schedule),
    ).toBeCloseTo(4.5, 8);
  });

  it('ignores deleted invalid revisions and uses the latest valid revision once', () => {
    const records = [
      {...temp(1), _id: 'a', absolute: 100, srvModified: 1},
      {...temp(1), _id: 'a', srvModified: 2},
      {...temp(2), deleted: true, absolute: -1},
      {...temp(2), isValid: false, absolute: -1},
    ];
    expect(estimate(records)).toBeCloseTo(4, 10);
    expect(estimate([records[0]!, {...records[1], deleted: true}])).toBeCloseTo(
      3,
      10,
    );
  });

  it('deduplicates completed basal fingerprints with different database ids', () => {
    const dose = {...temp(1), deliveredUnits: 1.8};
    expect(
      estimate([
        {...dose, _id: 'a'},
        {...dose, _id: 'b'},
      ]),
    ).toBeCloseTo(3.8, 10);
  });

  it('exports recorded spans with conflicts explicitly unknown', () => {
    const records = [
      {...temp(0), deliveredUnits: 1},
      {...temp(0.5, 30), deliveredUnits: 1},
    ];
    const period = {startMs, endMs: startMs + hour};
    const intervals = getRecordedBasalIntervals(records, period, period.endMs);
    expect(buildRecordedBasalSegments(intervals, period)).toEqual([
      {startMs, endMs: startMs + hour / 2, units: 0.5},
      {startMs: startMs + hour / 2, endMs: startMs + hour, units: undefined},
    ]);
    expect(estimate(records, 1)).toBeUndefined();
  });

  it.each([
    {absolute: -1},
    {absolute: 'unknown'},
    {absolute: undefined, rate: '0x10'},
    {absolute: undefined, temp: 'percentage', rate: 100},
    {absolute: undefined, percent: -101},
    {duration: 'unknown'},
    {duration: -1},
    {endDate: 'unknown'},
    {endDate: iso(-1)},
    {enteredBy: 'loop://phone', amount: -1},
    {deliveredUnits: 'unknown'},
  ])(
    'does not replace ambiguous basal evidence with schedule or zero: %j',
    overrides => {
      expect(estimate([{...temp(1), ...overrides}])).toBeUndefined();
    },
  );

  it('uses a completed actual amount to resolve an unknown programmed rate on its span', () => {
    expect(
      estimate([{...temp(1), absolute: 'unknown', deliveredUnits: 1.8}]),
    ).toBeCloseTo(3.8, 10);
  });

  it('cannot resolve conflicting simultaneous commands without recorded amounts', () => {
    expect(estimate([temp(1, 60, 2), temp(1, 60, 0)])).toBeUndefined();
  });

  it('cannot assign an undated basal event to a requested period', () => {
    expect(
      estimate([{...temp(1), created_at: '2026-02-31T00:00:00Z'}]),
    ).toBeUndefined();
  });

  it('rejects an unknown basal event and a rate with an unknown temp mode', () => {
    expect(
      estimate([{...temp(1), eventType: 'Unrecognized Basal'}]),
    ).toBeUndefined();
    expect(
      estimate([{...temp(1), absolute: undefined, rate: 2, temp: 'unknown'}]),
    ).toBeUndefined();
  });

  it('ignores future/exclusive-cutoff events and past malformed amount spans', () => {
    expect(estimate([temp(3, 60, -1), temp(4, 60, -1)])).toBeCloseTo(3, 10);
    expect(estimate([{...temp(-2), deliveredUnits: -1}])).toBeCloseTo(3, 10);
  });

  it('refuses unresolvable intraday profile changes', () => {
    expect(
      estimate([{eventType: 'Profile Switch', created_at: iso(1)}]),
    ).toBeUndefined();
    expect(
      estimate([{eventType: 'Profile Change', created_at: iso(1)}]),
    ).toBeUndefined();
    expect(
      estimate([{eventType: 'ProfileSwitch', created_at: iso(1)}]),
    ).toBeUndefined();
    expect(
      estimate([{eventType: 'ProfileChange', created_at: iso(1)}]),
    ).toBeUndefined();
    expect(
      estimate([{eventType: 'Profile Switch', created_at: iso(0)}]),
    ).toBeUndefined();
  });

  it.each(['Profile Switch', 'ProfileChange'])(
    'refuses unresolved permanent %s carry-in that may select another profile',
    eventType => {
      expect(
        estimate([
          {eventType, created_at: iso(-24), profile: 'Other', percentage: 150},
        ]),
      ).toBeUndefined();
      expect(
        estimate([{eventType, created_at: iso(-24), duration: 0}]),
      ).toBeUndefined();
    },
  );

  it.each([
    {created_at: iso(0), duration: 60},
    {created_at: iso(-0.5), duration: 60},
    {created_at: iso(-1), duration: 'unknown'},
    {created_at: iso(-1), endDate: 'unknown'},
    {created_at: iso(-1), endDate: iso(1)},
  ])('refuses unresolved temporary profile carry-in %j', interval => {
    expect(
      estimate([{eventType: 'Profile Switch', ...interval}]),
    ).toBeUndefined();
  });

  it('allows a temporary profile that already expired before the range', () => {
    expect(
      estimate([
        {eventType: 'Profile Switch', created_at: iso(-2), duration: 60},
      ]),
    ).toBeCloseTo(3, 10);
  });

  it.each([
    {entries: [], timeZone: 'UTC'},
    {entries: [{time: '25:00', value: 1}], timeZone: 'UTC'},
    {entries: [{time: '00:00', value: -1}], timeZone: 'UTC'},
    {entries: [{time: '00:00', value: NaN}], timeZone: 'UTC'},
    {entries: [{time: '00:00', timeAsSeconds: 60, value: 1}], timeZone: 'UTC'},
    {
      entries: [
        {time: '00:00', value: 1},
        {time: '00:00', value: 2},
      ],
      timeZone: 'UTC',
    },
    {...profile, timeZone: 'Unknown/Timezone'},
    {...profile, timeZone: ''},
    {...profile, timeZone: 'GMT+25'},
    {...profile, timeZone: 'GMT+5:99'},
    {...profile, timeZone: '+25:00'},
  ])('refuses missing or malformed profiles %j', schedule => {
    expect(estimate([], 3, schedule)).toBeUndefined();
  });

  it('refuses to estimate beyond observation and overflowing values', () => {
    expect(
      buildEstimatedBasalUnits(
        [],
        {startMs, endMs: startMs + 3 * hour},
        startMs + hour,
        profile,
      ),
    ).toBeUndefined();
    expect(
      estimate([], 3, {...profile, entries: [{time: '00:00', value: 1e308}]}),
    ).toBeUndefined();
  });
});

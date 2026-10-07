import {
  buildRecordedInsulinSummary,
  getFinalizedTreatmentInsulinUnits,
} from 'app/services/insulin/recordedInsulin';
import fixtures from '../fixtures/recorded-insulin.json';

describe('recorded insulin evidence', () => {
  it('does not label generic amounts, ambiguous boluses or unfinished delivery as delivered insulin', () => {
    const created_at = '2026-09-27T00:00:00Z';
    const observedAt = Date.parse('2026-09-27T00:30:00Z');
    for (const record of [
      {created_at, eventType: 'Profile Switch', amount: 150},
      {created_at, eventType: 'Correction Bolus', insulin: 2, duration: 60},
      {created_at, eventType: 'Combo Bolus', insulin: 2, duration: 10},
      {created_at, eventType: 'Temp Basal', absolute: 3.2, duration: 10},
    ])
      expect(
        getFinalizedTreatmentInsulinUnits(record, observedAt),
      ).toBeUndefined();
    expect(
      getFinalizedTreatmentInsulinUnits(
        {
          created_at,
          eventType: 'Temp Basal',
          deliveredUnits: 0.05,
          amount: 5,
          duration: 10,
        },
        observedAt,
      ),
    ).toBe(0.05);
  });
  it.each(fixtures)('$name', fixture => {
    expect(
      buildRecordedInsulinSummary(
        fixture.records,
        {startMs: Date.parse(fixture.start), endMs: Date.parse(fixture.end)},
        Date.parse(fixture.observedAt),
      ),
    ).toEqual(fixture.expected);
  });
  const startMs = Date.parse('2026-09-27T00:00:00Z');
  const hour = 3_600_000;
  const period = {startMs, endMs: startMs + hour};
  const basal = {
    eventType: 'Temp Basal',
    created_at: new Date(startMs).toISOString(),
    enteredBy: 'loop://phone',
    duration: 60,
    absolute: 1,
  };

  it('never falls back from an invalid recorded amount to the programmed rate', () => {
    expect(
      buildRecordedInsulinSummary(
        [{...basal, amount: -1}],
        period,
        period.endMs,
      ),
    ).toMatchObject({quality: 'partial', basalCoveragePercent: 0});
    expect(
      buildRecordedInsulinSummary(
        [{...basal, amount: -1}],
        period,
        period.endMs,
      ),
    ).not.toHaveProperty('basalUnits');
  });
  it('does not interpret percentage commands as absolute recorded rates', () => {
    expect(
      buildRecordedInsulinSummary(
        [{...basal, temp: 'percentage', rate: 100}],
        period,
        period.endMs,
      ),
    ).not.toHaveProperty('basalUnits');
  });
  it('keeps distinct recorded boluses even when dose and timestamp coincide', () => {
    const bolus = {
      eventType: 'Correction Bolus',
      created_at: new Date(startMs).toISOString(),
      insulin: 0.05,
    };
    expect(
      buildRecordedInsulinSummary(
        [
          {...bolus, _id: 'a'},
          {...bolus, _id: 'b'},
        ],
        period,
        period.endMs,
      ),
    ).toMatchObject({bolusUnits: 0.1});
  });
  it('excludes the exclusive cutoff and later boluses', () => {
    expect(
      buildRecordedInsulinSummary(
        [
          {
            eventType: 'Correction Bolus',
            created_at: new Date(period.endMs).toISOString(),
            insulin: 50,
          },
        ],
        period,
        period.endMs,
      ),
    ).toMatchObject({bolusUnits: 0});
  });
  it('uses the latest event revision instead of adding both versions', () => {
    const bolus = {
      eventType: 'Correction Bolus',
      created_at: new Date(startMs).toISOString(),
      syncIdentifier: 'dose',
    };
    expect(
      buildRecordedInsulinSummary(
        [
          {...bolus, insulin: 2, srvModified: 2},
          {...bolus, insulin: 5, srvModified: 1},
        ],
        period,
        period.endMs,
      ),
    ).toMatchObject({bolusUnits: 2});
  });
  it('clips completed square delivery crossing midnight but refuses an ambiguous combo amount', () => {
    const bolus = {
      eventType: 'Correction Bolus',
      type: 'square',
      created_at: new Date(startMs - hour / 2).toISOString(),
      duration: 60,
      insulin: 2,
    };
    expect(
      buildRecordedInsulinSummary([bolus], period, period.endMs),
    ).toMatchObject({bolusUnits: 1});
    expect(
      buildRecordedInsulinSummary(
        [
          {...basal, amount: 1},
          {...bolus, type: 'dual'},
        ],
        period,
        period.endMs,
      ),
    ).toMatchObject({
      quality: 'partial',
      basalUnits: 1,
      basalCoveragePercent: 100,
    });
    expect(
      buildRecordedInsulinSummary(
        [
          {...basal, amount: 1},
          {...bolus, type: 'dual'},
        ],
        period,
        period.endMs,
      ),
    ).not.toHaveProperty('bolusUnits');
  });
  it('does not count an unfinished bolus as a finalized recorded dose', () => {
    const bolus = {
      eventType: 'Correction Bolus',
      created_at: new Date(startMs).toISOString(),
      duration: 60,
      insulin: 2,
    };
    expect(
      buildRecordedInsulinSummary(
        [bolus],
        {...period, endMs: startMs + 10_000},
        startMs + 10_000,
      ),
    ).not.toHaveProperty('bolusUnits');
  });

  it('integrates 10000 completed intervals with exact coverage and a known sum', () => {
    const count = 10_000;
    const intervalMs = 5 * 60_000;
    const endMs = startMs + count * intervalMs;
    const records = Array.from({length: count}, (_, index) => ({
      _id: `dose-${index}`,
      eventType: 'Temp Basal',
      enteredBy: 'loop://fixture',
      created_at: new Date(startMs + index * intervalMs).toISOString(),
      duration: 5,
      amount: 0.125,
    }));
    expect(
      buildRecordedInsulinSummary(records, {startMs, endMs}, endMs),
    ).toEqual({
      quality: 'available',
      basalUnits: 1250,
      bolusUnits: 0,
      basalCoveredMs: count * intervalMs,
      basalCoveragePercent: 100,
      basalEvidence: 'recorded',
    });
  });
});

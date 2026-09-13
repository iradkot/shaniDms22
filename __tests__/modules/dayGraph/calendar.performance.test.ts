import {
  buildDayGraphCalendar,
  moveLocalDays,
  periodForLocalMonth,
  type DayGraphCalendarSnapshot,
} from 'app/modules/dayGraph';

describe('Calendar summary work budget', () => {
  it('prepares a full month without repeatedly reading every source value', () => {
    const period = periodForLocalMonth(new Date(2024, 1, 1).getTime());
    let valueReads = 0;
    const glucoseSamples: DayGraphCalendarSnapshot['glucoseSamples'][number][] =
      [];
    for (
      let day = period.dayStartMs;
      day < period.dayEndMs;
      day = moveLocalDays(day, 1)
    ) {
      for (
        let timestampMs = day;
        timestampMs < moveLocalDays(day, 1);
        timestampMs += 5 * 60_000
      ) {
        glucoseSamples.push({
          identity: {sourceId: 'fixture', recordId: String(timestampMs)},
          timestampMs,
          get valueMgDl() {
            valueReads += 1;
            return 120;
          },
        });
      }
    }

    const days = buildDayGraphCalendar({
      monthStartMs: period.dayStartMs,
      nowMs: period.dayEndMs,
      snapshot: {
        glucoseSamples,
        complete: true,
        freshness: {kind: 'fresh', fetchedAtMs: period.dayEndMs},
      },
    });

    expect(days).toHaveLength(29);
    expect(
      days.every(
        day =>
          day.status === 'data' &&
          day.timeInRangePct === 100 &&
          day.coveragePct === 100 &&
          !day.partial,
      ),
    ).toBe(true);
    // A deterministic work budget, not a device-speed assertion. Three reads
    // allow finite/positive validation and a value snapshot. A repeated full
    // preparation reads each input value six times and exceeds this budget.
    expect(valueReads).toBeLessThanOrEqual(glucoseSamples.length * 3);
  });
});
